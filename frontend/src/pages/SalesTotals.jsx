import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import logo from "../images/logo.png";
import { useEmailSendOverlay } from "../components/EmailSendOverlay";
import SalesTotalsDashboard from "../components/SalesTotalsDashboard";
import SalesMonthLists from "../components/SalesMonthLists";
import { captureElementsToPdfBlob } from "../utils/captureElementPdf";
import { filterProjectsForSalesMonth } from "../utils/salesMonths";
import {
  computeSalesTotalsData,
  filterProjectsByPeriod,
  formatSalesTotalsCurrency,
  formatSalesTotalsPeriodLabel,
  getAvailableCalendarYears,
  getAvailableFinancialYears,
  getCurrentFinancialYearEnd,
  getMonthsForPdfExportByView,
  getPeriodProgressMeta,
  normalizeProjectYearToISO,
  SALES_YEAR_VIEW,
} from "../utils/salesTotalsCompute";

const SALES_TOTALS_EMAIL_FROM = "info@superiorgrannyflats.com.au";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const LIGHT_MONUMENT = "#42464d";
const WHITE = "#fff";
const API_URL = "";

// Stream color mapping (same as Sales page)
const STREAM_COLORS = {
  "SGF - VIC": { darker: "#4D93D9", lighter: "#A6C9EC" },
  "SGF - QLD": { darker: "#D54358", lighter: "#F79198" },
  "Dual Dwelling": { darker: "#92D050", lighter: "#CEEAB0" },
  "ATA": { darker: "#92D050", lighter: "#CEEAB0" },
  "Pumped On Property": { darker: "#92D050", lighter: "#CEEAB0" },
  "Henderson": { darker: "#92D050", lighter: "#CEEAB0" },
  "Create Cash Flow": { darker: "#92D050", lighter: "#CEEAB0" },
  "Fresh Start Advisory": { darker: "#92D050", lighter: "#CEEAB0" },
  "Home Office / Studio": { darker: "#FF8C42", lighter: "#FFD4B3" },
};

export default function SalesTotals() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedYear, setSelectedYear] = useState(() => {
    return new Date().getFullYear().toString();
  });
  const [yearView, setYearView] = useState(SALES_YEAR_VIEW.CALENDAR);

  // Modal shown when user clicks the VIC/QLD total rectangles.
  // "VIC" | "QLD" | null
  const [stateJobsModalState, setStateJobsModalState] = useState(null);
  const todayISO = React.useMemo(() => new Date().toISOString().split("T")[0], []);

  const pdfEmailBodyRef = useRef(null);
  const pdfPageRefs = useRef([]);
  const [pdfExportPages, setPdfExportPages] = useState(null);
  const { runWithEmailOverlay } = useEmailSendOverlay();
  const [pdfEmailModalOpen, setPdfEmailModalOpen] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfSending, setPdfSending] = useState(false);
  const [pdfEmailTo, setPdfEmailTo] = useState("");
  const [pdfEmailFrom, setPdfEmailFrom] = useState(SALES_TOTALS_EMAIL_FROM);
  const [pdfEmailSubject, setPdfEmailSubject] = useState("");
  const [pdfEmailBody, setPdfEmailBody] = useState("");
  const [pdfAttachmentBlob, setPdfAttachmentBlob] = useState(null);
  const [pdfAttachmentFilename, setPdfAttachmentFilename] = useState("");

  useEffect(() => {
    if (!stateJobsModalState) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [stateJobsModalState]);

  useEffect(() => {
    if (!pdfEmailModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [pdfEmailModalOpen]);

  useEffect(() => {
    if (!pdfEmailModalOpen || !pdfEmailBodyRef.current) return;
    if (pdfEmailBodyRef.current.innerHTML !== pdfEmailBody) {
      pdfEmailBodyRef.current.innerHTML = pdfEmailBody || "";
    }
  }, [pdfEmailModalOpen, pdfEmailBody]);

  useEffect(() => {
    if (!stateJobsModalState) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") setStateJobsModalState(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stateJobsModalState]);

  function openStateJobsModal(state) {
    setStateJobsModalState(state);
  }

  function closeStateJobsModal() {
    setStateJobsModalState(null);
  }

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

  // Available periods for the year dropdown (calendar or financial)
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

  React.useEffect(() => {
    if (availablePeriods.length === 0) return;
    if (!availablePeriods.includes(selectedYear)) {
      setSelectedYear(availablePeriods[0]);
    }
  }, [availablePeriods, selectedYear]);

  const yearFilteredProjects = React.useMemo(
    () => filterProjectsByPeriod(projects, selectedYear, yearView),
    [projects, selectedYear, yearView]
  );

  const periodProgressMeta = React.useMemo(
    () => getPeriodProgressMeta(selectedYear, yearView),
    [selectedYear, yearView]
  );

  const salesTotalsData = React.useMemo(
    () => computeSalesTotalsData(yearFilteredProjects, periodProgressMeta),
    [yearFilteredProjects, periodProgressMeta]
  );

  const formatCurrency = formatSalesTotalsCurrency;

  const RANGE_START_ISO = "2026-01-01";

  function isHomeOfficeStudio(project) {
    return (project?.classification || "").trim() === "Home Office / Studio";
  }

  function isVICProject(project) {
    const state = (project.state || "").trim().toUpperCase();
    return state === "VIC" || state === "VICTORIA";
  }

  function isQLDProject(project) {
    const state = (project.state || "").trim().toUpperCase();
    return state === "QLD" || state === "QUEENSLAND";
  }

  function getProjectCostDisplay(project) {
    if (!project?.project_cost) return "";
    const cost = parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || "0", 10);
    if (!cost) return "";
    return `$${cost.toLocaleString()}`;
  }

  const vicJobs2026ToDate = React.useMemo(() => {
    return projects
      .map((project) => ({ project, isoStart: normalizeProjectYearToISO(project.year) }))
      .filter(({ project, isoStart }) => {
        if (!isoStart) return false;
        if (isoStart < RANGE_START_ISO || isoStart > todayISO) return false;
        if (isHomeOfficeStudio(project)) return false;
        return isVICProject(project);
      })
      .sort((a, b) => b.isoStart.localeCompare(a.isoStart))
      .map(({ project, isoStart }) => ({ project, isoStart }));
  }, [projects, todayISO]);

  const qldJobs2026ToDate = React.useMemo(() => {
    return projects
      .map((project) => ({ project, isoStart: normalizeProjectYearToISO(project.year) }))
      .filter(({ project, isoStart }) => {
        if (!isoStart) return false;
        if (isoStart < RANGE_START_ISO || isoStart > todayISO) return false;
        if (isHomeOfficeStudio(project)) return false;
        return isQLDProject(project);
      })
      .sort((a, b) => b.isoStart.localeCompare(a.isoStart))
      .map(({ project, isoStart }) => ({ project, isoStart }));
  }, [projects, todayISO]);

  const stateJobsModalProjects =
    stateJobsModalState === "VIC"
      ? vicJobs2026ToDate
      : stateJobsModalState === "QLD"
        ? qldJobs2026ToDate
        : [];

  function closePdfEmailModal() {
    setPdfEmailModalOpen(false);
    setPdfAttachmentBlob(null);
    setPdfAttachmentFilename("");
  }

  async function handleOpenPdfEmail() {
    if (loading) {
      alert("Please wait for sales totals to finish loading.");
      return;
    }
    if (error) {
      alert("Cannot export PDF while data failed to load.");
      return;
    }

    const annualMeta = getPeriodProgressMeta(selectedYear, yearView);
    const monthDefs = getMonthsForPdfExportByView(selectedYear, yearView);
    const pages = [
      {
        key: "annual",
        pageType: "totals",
        title: "SALES TOTALS",
        data: computeSalesTotalsData(yearFilteredProjects, annualMeta),
      },
      ...monthDefs.map((m) => ({
        key: `month-${m.calendarYear}-${m.monthIndex}`,
        pageType: "sales-list",
        title: m.title,
        monthProjects: filterProjectsForSalesMonth(
          projects,
          m.calendarYear,
          m.monthIndex,
          todayISO
        ).filter((p) => (p.classification || "").trim() !== "Home Office / Studio"),
      })),
    ];

    setPdfGenerating(true);
    pdfPageRefs.current = [];
    setPdfExportPages(pages);

    try {
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });

      const elements = pages.map((_, i) => pdfPageRefs.current[i]).filter(Boolean);
      if (elements.length !== pages.length) {
        throw new Error("Could not render all PDF pages.");
      }

      const pdfBlob = await captureElementsToPdfBlob(elements);
      const filename =
        yearView === SALES_YEAR_VIEW.FINANCIAL
          ? `Sales-Totals-FY-${periodLabel.replace("/", "-")}.pdf`
          : `Sales-Totals-${selectedYear}.pdf`;
      setPdfAttachmentBlob(pdfBlob);
      setPdfAttachmentFilename(filename);
      setPdfEmailFrom(SALES_TOTALS_EMAIL_FROM);
      setPdfEmailSubject(`Sales Totals ${periodLabel}`);
      setPdfEmailBody(`Please find attached the Sales Totals report for ${periodLabel}.`);
      setPdfEmailTo("");
      setPdfEmailModalOpen(true);
    } catch (err) {
      console.error("Sales totals PDF error:", err);
      alert(err.message || "Failed to generate PDF.");
    } finally {
      setPdfExportPages(null);
      setPdfGenerating(false);
    }
  }

  async function handleSendPdfEmail() {
    const toAddresses = pdfEmailTo
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
    if (toAddresses.length === 0) {
      alert("Please enter at least one email address.");
      return;
    }
    if (!pdfEmailFrom.trim()) {
      alert("From address is required.");
      return;
    }
    if (!pdfAttachmentBlob) {
      alert("PDF attachment is missing. Close and try PDF again.");
      return;
    }
    const bodyHtml = pdfEmailBodyRef.current?.innerHTML ?? pdfEmailBody;
    const filename = pdfAttachmentFilename || `Sales-Totals-${periodLabel}.pdf`;

    setPdfSending(true);
    try {
      await runWithEmailOverlay(async () => {
        const form = new FormData();
        form.append("to", toAddresses.join(","));
        form.append("from", pdfEmailFrom.trim());
        form.append("subject", pdfEmailSubject || "");
        form.append("htmlBody", bodyHtml || "");
        form.append("attachment", pdfAttachmentBlob, filename);

        const res = await fetch(`${API_URL}/api/emails/send`, {
          method: "POST",
          body: form,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Send failed (${res.status})`);
      });
      alert("Email sent successfully.");
      closePdfEmailModal();
    } catch (err) {
      console.error("Send sales totals PDF email error:", err);
      alert(err.message || "Failed to send email.");
    } finally {
      setPdfSending(false);
    }
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
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "2.4rem",
              fontWeight: 700,
              color: WHITE,
              letterSpacing: "1px",
            }}
          >
            Sales Totals
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
          {/* Analytics - Light Blue */}
          <div style={{ background: "#A6C9EC", borderRadius: "10px", padding: "4px", border: "2px solid #000" }}>
            <Link
              to="/sales-analytics"
              style={{
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
              }}
            >
              Analytics
            </Link>
          </div>

          {/* PDF - Light Grey */}
          <div style={{ background: "#e8e8ea", borderRadius: "10px", padding: "4px", border: "2px solid #000" }}>
            <button
              type="button"
              onClick={handleOpenPdfEmail}
              disabled={pdfGenerating || loading}
              style={{
                width: "100%",
                background: "transparent",
                color: "#404049",
                border: "none",
                borderRadius: "10px",
                padding: "8px 8px",
                fontSize: "0.95rem",
                fontWeight: 500,
                textAlign: "center",
                letterSpacing: "0.5px",
                cursor: pdfGenerating || loading ? "wait" : "pointer",
                transition: "background 0.18s, color 0.15s",
                lineHeight: "1.4",
                opacity: pdfGenerating || loading ? 0.7 : 1,
              }}
            >
              {pdfGenerating ? "Generating PDF…" : "PDF & Send"}
            </button>
          </div>
          
          <div style={{ flex: 1 }} />
          
          {/* Back to Sales - Light Red */}
          <div style={{ background: "#F79198", borderRadius: "10px", padding: "4px", border: "2px solid #000" }}>
            <Link
              to="/sales"
              style={{
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
            minWidth: 0,
            justifyContent: "space-between",
          }}
        >
          {loading && <p style={{ color: "#32323399" }}>Loading projects...</p>}
          {error && <p style={{ color: "#cc3333" }}>Error: {error}</p>}
          {!loading && !error && (
            <SalesTotalsDashboard
              data={salesTotalsData}
              selectedYear={selectedYear}
              periodLabel={periodLabel}
              streamColors={STREAM_COLORS}
              onStateClick={openStateJobsModal}
            />
          )}
        </div>
      </div>

      {/* Hidden off-screen pages for PDF export (annual + each month YTD) */}
      {pdfExportPages && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: "-12000px",
            top: 0,
            width: "1100px",
            zIndex: -1,
            pointerEvents: "none",
          }}
        >
          {pdfExportPages.map((page, index) => (
            <div
              key={page.key}
              ref={(el) => {
                if (el) pdfPageRefs.current[index] = el;
              }}
              style={{
                background: SECTION_GREY,
                padding: "24px 32px",
                marginBottom: "24px",
                width: "1100px",
                boxSizing: "border-box",
              }}
            >
              {page.pageType === "totals" ? (
                <>
                  <h2
                    style={{
                      margin: "0 0 16px 0",
                      fontSize: "1.6rem",
                      fontWeight: 700,
                      color: MONUMENT,
                      letterSpacing: "0.5px",
                    }}
                  >
                    {page.title}
                    <span style={{ fontWeight: 500, fontSize: "1.1rem", marginLeft: "12px" }}>{periodLabel}</span>
                  </h2>
                  <SalesTotalsDashboard
                    data={page.data}
                    selectedYear={selectedYear}
                    periodLabel={periodLabel}
                    streamColors={STREAM_COLORS}
                  />
                </>
              ) : (
                <SalesMonthLists
                  pageTitle={`${page.title} — ${periodLabel}`}
                  monthFilteredProjects={page.monthProjects}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* State jobs modal (2026 to date) */}
      {stateJobsModalState && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            overflow: "hidden",
            padding: "16px",
          }}
          onClick={closeStateJobsModal}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <div
            style={{
              backgroundColor: WHITE,
              padding: "24px",
              borderRadius: "8px",
              minWidth: "760px",
              maxWidth: "95%",
              maxHeight: "80vh",
              overflow: "hidden",
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.25rem", color: MONUMENT }}>
                  {stateJobsModalState} jobs
                </h2>
                <div style={{ fontSize: "0.95rem", color: MONUMENT, marginTop: "6px", opacity: 0.85 }}>
                  {RANGE_START_ISO} to {todayISO}
                </div>
                <div style={{ fontSize: "0.85rem", color: MONUMENT, marginTop: "4px", opacity: 0.85 }}>
                  Total: {stateJobsModalProjects.length}
                </div>
              </div>
              <button
                onClick={closeStateJobsModal}
                style={{
                  padding: "8px 12px",
                  fontSize: "0.9rem",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                  backgroundColor: WHITE,
                  color: MONUMENT,
                  cursor: "pointer",
                  height: "fit-content",
                }}
              >
                Close
              </button>
            </div>

            <div style={{ marginTop: "16px", overflowY: "auto", flex: 1 }}>
              {stateJobsModalProjects.length === 0 ? (
                <div style={{ color: MONUMENT, opacity: 0.85, padding: "12px 4px" }}>
                  No jobs found for this range.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.92rem" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#f3f3f3" }}>
                      <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>Start</th>
                      <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>Project</th>
                      <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>Stream</th>
                      <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>Cost</th>
                      <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>Client</th>
                      <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stateJobsModalProjects.map(({ project, isoStart }) => {
                      const projectLabel =
                        project?.suburb && project?.street
                          ? `${project.suburb.toUpperCase()} - ${project.street}`
                          : project?.name || "Unknown Project";
                      const clientLabel = project?.client_name || project?.client1_name || "";
                      return (
                        <tr key={project.id} style={{ borderTop: "1px solid #eee" }}>
                          <td style={{ padding: "10px", whiteSpace: "nowrap", color: MONUMENT, opacity: 0.9 }}>
                            {isoStart}
                          </td>
                          <td style={{ padding: "10px", color: MONUMENT, opacity: 0.95 }}>
                            {projectLabel}
                          </td>
                          <td style={{ padding: "10px", color: MONUMENT, opacity: 0.9 }}>{project?.stream || ""}</td>
                          <td style={{ padding: "10px", whiteSpace: "nowrap", color: MONUMENT, opacity: 0.95 }}>
                            {getProjectCostDisplay(project)}
                          </td>
                          <td style={{ padding: "10px", color: MONUMENT, opacity: 0.9 }}>{clientLabel}</td>
                          <td style={{ padding: "10px", color: MONUMENT, opacity: 0.9 }}>{project?.status || ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PDF email modal */}
      {pdfEmailModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 3000,
            padding: "16px",
            pointerEvents: "auto",
          }}
          onClick={closePdfEmailModal}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "24px",
              width: "90%",
              maxWidth: "800px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0, fontSize: "1.5rem", color: MONUMENT }}>Send Sales Totals PDF</h2>
              <button
                type="button"
                onClick={closePdfEmailModal}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                  color: MONUMENT,
                  padding: 0,
                  width: 30,
                  height: 30,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div
                style={{
                  fontSize: "0.9rem",
                  color: MONUMENT,
                  background: "#f5f5f5",
                  borderRadius: "8px",
                  padding: "10px 12px",
                }}
              >
                Attachment: <strong>{pdfAttachmentFilename || `Sales-Totals-${periodLabel}.pdf`}</strong>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
                  To (comma-separated)
                </label>
                <input
                  type="text"
                  value={pdfEmailTo}
                  onChange={(e) => setPdfEmailTo(e.target.value)}
                  placeholder="recipient@example.com"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: `1px solid ${SECTION_GREY}`,
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
                  From
                </label>
                <input
                  type="text"
                  value={pdfEmailFrom}
                  onChange={(e) => setPdfEmailFrom(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: `1px solid ${SECTION_GREY}`,
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
                  Subject
                </label>
                <input
                  type="text"
                  value={pdfEmailSubject}
                  onChange={(e) => setPdfEmailSubject(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: `1px solid ${SECTION_GREY}`,
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
                  Body
                </label>
                <div
                  ref={pdfEmailBodyRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => setPdfEmailBody(e.currentTarget.innerHTML)}
                  onBlur={(e) => setPdfEmailBody(e.currentTarget.innerHTML)}
                  style={{
                    width: "100%",
                    minHeight: "220px",
                    padding: "12px",
                    borderRadius: "8px",
                    border: `1px solid ${SECTION_GREY}`,
                    fontSize: "0.95rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                    lineHeight: 1.6,
                    outline: "none",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={closePdfEmailModal}
                  disabled={pdfSending}
                  style={{
                    padding: "10px 20px",
                    fontSize: "1rem",
                    fontWeight: 500,
                    color: MONUMENT,
                    background: "transparent",
                    border: `1px solid ${SECTION_GREY}`,
                    borderRadius: "8px",
                    cursor: pdfSending ? "not-allowed" : "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSendPdfEmail}
                  disabled={pdfSending}
                  style={{
                    padding: "10px 20px",
                    fontSize: "1rem",
                    fontWeight: 500,
                    color: WHITE,
                    background: MONUMENT,
                    border: "none",
                    borderRadius: "8px",
                    cursor: pdfSending ? "not-allowed" : "pointer",
                    opacity: pdfSending ? 0.85 : 1,
                  }}
                >
                  {pdfSending ? "Sending…" : "Send Email"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
