import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { isUserAdmin, getApiHeaders } from "../utils/auth";
import useAppLogo from "../hooks/useAppLogo.js";
import { UI } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = "#ffffff";
const PAGE_TEXT = UI.pageText;
const GRID_LINE = "#000000";
const HEADER_GRID_LINE = "#d0d0d0";
const HEADER_BG = "#f3f3f3";
const HEADER_TEXT = "#333333";
const HEADING_BLUE = "rgb(21, 13, 247)";
const HEADER_SELECT_BG = "rgb(180, 198, 231)";
const ADDRESS_TEXT = "#000000";
const COL_A_FILL = "rgb(218, 242, 208)";
const SELECTION_OUTLINE = `inset 0 0 0 2px ${HEADING_BLUE}`;
const API_URL = "";

const COL_COUNT = 78; // A–BZ
const ROW_COUNT = 300;
const VISIBLE_ROWS = 23;
const DATA_START_ROW = 2; // row 1 = titles; row 2 reserved for Sent/Received later
const ROW_HEADER_WIDTH = 48;
const DEFAULT_COL_WIDTH = 96;
const COL_A_DEFAULT_WIDTH = 220;
const MIN_COL_WIDTH = 40;
const MIN_ROW_HEIGHT = 16;
const COL_HEADER_HEIGHT = 28;
const TITLE_BAND_BG = "#e8e8e8";

/**
 * Row 1 merged title cells (0-based col indices).
 * Optional row2[] fills subheadings under each spanned column.
 * colSpan 2 with no row2 defaults to Sent | Received.
 */
const SHEET_TITLE_BLOCKS = [
  { startCol: 0, colSpan: 1, label: "Project Address" }, // A
  { startCol: 1, colSpan: 1, label: "Draftsperson" }, // B
  { startCol: 2, colSpan: 2, label: "Land Channel - Zones & Overlays" }, // C–D
  { startCol: 4, colSpan: 2, label: "Land Data - Title & Covenants" }, // E–F
  { startCol: 6, colSpan: 2, label: "DBYD - Stormwater" }, // G–H
  { startCol: 8, colSpan: 2, label: "DBYD - Sewer" }, // I–J
  { startCol: 10, colSpan: 2, label: "Sewer Plan - Water Authority" }, // K–L
  { startCol: 12, colSpan: 2, label: "Sewer - Size, Depth, Offset" }, // M–N
  { startCol: 14, colSpan: 2, label: "LPOD" }, // O–P
  { startCol: 16, colSpan: 2, label: "Property Info - Council" }, // Q–R
  { startCol: 18, colSpan: 1, label: "Job File Created" }, // S
  { startCol: 19, colSpan: 1, label: "Concept" }, // T
  { startCol: 20, colSpan: 1, label: "Working Drawings" }, // U
  { startCol: 21, colSpan: 2, label: "JCA Land Survey" }, // V–W
  { startCol: 23, colSpan: 2, label: "Soil Test Melbourne" }, // X–Y
  { startCol: 25, colSpan: 2, label: "Footing Certification", row2: ["Sent", "Received"] }, // Z–AA
  { startCol: 27, colSpan: 1, label: "Site Visit - Plans Updated" }, // AB
  { startCol: 28, colSpan: 2, label: "Town Planning", row2: ["Requested", "Received"] }, // AC–AD
  { startCol: 30, colSpan: 1, label: "Town Planning Needed" }, // AE
  { startCol: 31, colSpan: 1, label: "Flooding" }, // AF
  { startCol: 32, colSpan: 2, label: "Subject to 153,154 - Melb Water", row2: ["Sent", "Received"] }, // AG–AH
  { startCol: 34, colSpan: 2, label: "Subject to 153,154 - Council", row2: ["Sent", "Received"] }, // AI–AJ
  { startCol: 36, colSpan: 2, label: "BAL Required", row2: ["Requested", "Received"] }, // AK–AL
  { startCol: 38, colSpan: 2, label: "Energy Rating", row2: ["Sent", "Received"] }, // AM–AN
  { startCol: 40, colSpan: 1, label: "Energy Specs Added to Plans" }, // AO
  { startCol: 41, colSpan: 2, label: "Windows", row2: ["Requested", "Received"] }, // AP–AQ
  { startCol: 43, colSpan: 3, label: "Sewer/Septic Application", row2: ["Authority", "Requested", "Received"] }, // AR–AT
  { startCol: 46, colSpan: 1, label: "Warranty Insurance" }, // AU
  { startCol: 47, colSpan: 2, label: "Building Permit", row2: ["Requested", "Received"] }, // AV–AW
  { startCol: 49, colSpan: 2, label: "Asset Protection", row2: ["Sent", "Received"] }, // AX–AY
  { startCol: 51, colSpan: COL_COUNT - 51, label: "" }, // AZ–BZ
];

/** Row 2 labels per column under multi-column title blocks. */
function buildRow2Subheadings() {
  const labels = Array.from({ length: COL_COUNT }, () => "");
  for (const block of SHEET_TITLE_BLOCKS) {
    const row2 =
      block.row2 ??
      (block.colSpan === 2 ? ["Sent", "Received"] : null);
    if (!row2) continue;
    for (let i = 0; i < block.colSpan && i < row2.length; i += 1) {
      labels[block.startCol + i] = row2[i];
    }
  }
  return labels;
}

const ROW2_SUBHEADINGS = buildRow2Subheadings();


const inactiveLinkStyle = {
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
};

const activeLinkStyle = {
  ...inactiveLinkStyle,
  background: UI.cardBg,
  color: MONUMENT,
  outline: `1px solid ${UI.outline}`,
  boxShadow: "0 2px 4px rgba(50,50,51,.04)",
};

/** 0-based index → Excel column letters (A … BZ). */
function colLetter(index) {
  let n = index;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

const COL_LETTERS = Array.from({ length: COL_COUNT }, (_, i) => colLetter(i));

function projectLabel(project) {
  const name = project?.name != null ? String(project.name).trim() : "";
  if (name) return name;
  const parts = [project?.street, project?.suburb]
    .map((s) => (s == null ? "" : String(s).trim()))
    .filter(Boolean);
  return parts.join(", ") || `Project #${project?.id ?? ""}`;
}

function buildDefaultColWidths() {
  return Array.from({ length: COL_COUNT }, (_, i) => (i === 0 ? COL_A_DEFAULT_WIDTH : DEFAULT_COL_WIDTH));
}

function buildDefaultRowHeights(h) {
  return Array.from({ length: ROW_COUNT }, () => h);
}

function sanitizeColWidths(raw) {
  if (!Array.isArray(raw) || raw.length !== COL_COUNT) return null;
  const next = raw.map((v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(MIN_COL_WIDTH, Math.round(n)) : null;
  });
  return next.every((n) => n != null) ? next : null;
}

function sanitizeRowHeights(raw) {
  if (!Array.isArray(raw) || raw.length !== ROW_COUNT) return null;
  const next = raw.map((v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(MIN_ROW_HEIGHT, Math.round(n)) : null;
  });
  return next.every((n) => n != null) ? next : null;
}

function normalizeLayoutPayload(raw) {
  if (!raw || typeof raw !== "object") return null;
  const colWidths = sanitizeColWidths(raw.colWidths);
  const rowsCustomized = Boolean(raw.rowsCustomized);
  const rowHeights = rowsCustomized ? sanitizeRowHeights(raw.rowHeights) : null;
  if (!colWidths && !rowHeights) return null;
  return { colWidths, rowHeights, rowsCustomized: Boolean(rowHeights) };
}

async function fetchSharedLayout() {
  const res = await fetch(`${API_URL}/api/planning-manager-layout`, {
    headers: getApiHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to load sheet layout (${res.status})`);
  const data = await res.json().catch(() => ({}));
  return normalizeLayoutPayload(data.layout);
}

async function persistSharedLayout(colWidths, rowHeights, rowsCustomized) {
  const layout = {
    colWidths,
    rowsCustomized: Boolean(rowsCustomized),
    rowHeights: rowsCustomized ? rowHeights : undefined,
  };
  const res = await fetch(`${API_URL}/api/planning-manager-layout`, {
    method: "PUT",
    headers: getApiHeaders(),
    body: JSON.stringify({ layout }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to save sheet layout (${res.status})`);
  }
}

export default function PlanningManager() {
  const logo = useAppLogo();
  const [isAdmin, setIsAdmin] = useState(false);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sheetReady, setSheetReady] = useState(false);

  const sheetViewportRef = useRef(null);
  const [baseRowHeight, setBaseRowHeight] = useState(28);
  const [colWidths, setColWidths] = useState(buildDefaultColWidths);
  const [rowHeights, setRowHeights] = useState(() => buildDefaultRowHeights(28));
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportSize, setViewportSize] = useState({ w: 800, h: 600 });
  const [selectedCell, setSelectedCell] = useState(null); // { row, col } | null

  const resizeRef = useRef(null);
  const userResizedRowsRef = useRef(false);
  const colWidthsRef = useRef(colWidths);
  const rowHeightsRef = useRef(rowHeights);
  const saveLayoutTimerRef = useRef(null);
  colWidthsRef.current = colWidths;
  rowHeightsRef.current = rowHeights;

  const queueSaveLayout = useCallback((nextCols, nextRows, rowsCustomized) => {
    if (saveLayoutTimerRef.current) clearTimeout(saveLayoutTimerRef.current);
    saveLayoutTimerRef.current = setTimeout(() => {
      persistSharedLayout(nextCols, nextRows, rowsCustomized).catch((err) => {
        console.error("Failed to save planning manager layout:", err);
      });
    }, 250);
  }, []);

  useEffect(() => {
    (async () => setIsAdmin(await isUserAdmin()))();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [projectsRes, layout] = await Promise.all([
          fetch(`${API_URL}/api/projects`, { headers: getApiHeaders() }),
          fetchSharedLayout().catch((err) => {
            console.error("Failed to load planning manager layout:", err);
            return null;
          }),
        ]);
        if (!projectsRes.ok) throw new Error(`Failed to fetch projects: ${projectsRes.statusText}`);
        const data = await projectsRes.json();
        if (cancelled) return;
        const list = Array.isArray(data) ? [...data] : [];
        list.sort((a, b) =>
          projectLabel(a).localeCompare(projectLabel(b), undefined, { sensitivity: "base" })
        );
        setProjects(list);
        if (layout?.colWidths) setColWidths(layout.colWidths);
        if (layout?.rowsCustomized && layout.rowHeights) {
          userResizedRowsRef.current = true;
          setRowHeights(layout.rowHeights);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load projects");
          setProjects([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setSheetReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (saveLayoutTimerRef.current) clearTimeout(saveLayoutTimerRef.current);
    };
  }, []);

  const fitRowHeightToViewport = useCallback(() => {
    const el = sheetViewportRef.current;
    if (!el) return;
    const available = el.clientHeight - COL_HEADER_HEIGHT;
    if (available <= 0) return;
    const next = Math.max(MIN_ROW_HEIGHT, Math.floor(available / VISIBLE_ROWS));
    setViewportSize({ w: el.clientWidth, h: el.clientHeight });
    setBaseRowHeight(next);
    if (!userResizedRowsRef.current) {
      setRowHeights(buildDefaultRowHeights(next));
    }
  }, []);

  useLayoutEffect(() => {
    if (!sheetReady) return undefined;
    fitRowHeightToViewport();
    const el = sheetViewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => fitRowHeightToViewport());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitRowHeightToViewport, sheetReady]);

  const colOffsets = useMemo(() => {
    const offsets = new Array(COL_COUNT + 1);
    offsets[0] = 0;
    for (let i = 0; i < COL_COUNT; i += 1) offsets[i + 1] = offsets[i] + colWidths[i];
    return offsets;
  }, [colWidths]);

  const rowOffsets = useMemo(() => {
    const offsets = new Array(ROW_COUNT + 1);
    offsets[0] = 0;
    for (let i = 0; i < ROW_COUNT; i += 1) {
      offsets[i + 1] = offsets[i] + (rowHeights[i] ?? baseRowHeight);
    }
    return offsets;
  }, [rowHeights, baseRowHeight]);

  const totalWidth = colOffsets[COL_COUNT];
  const totalHeight = rowOffsets[ROW_COUNT];

  const visibleRowRange = useMemo(() => {
    const bodyH = Math.max(0, viewportSize.h - COL_HEADER_HEIGHT);
    const y0 = Math.max(0, scrollTop);
    const y1 = y0 + bodyH;
    let start = 0;
    while (start < ROW_COUNT - 1 && rowOffsets[start + 1] <= y0) start += 1;
    let end = start;
    while (end < ROW_COUNT && rowOffsets[end] < y1) end += 1;
    return {
      start: Math.max(0, start - 2),
      end: Math.min(ROW_COUNT, end + 2),
    };
  }, [scrollTop, rowOffsets, viewportSize.h]);

  const visibleColRange = useMemo(() => {
    const bodyW = Math.max(0, viewportSize.w - ROW_HEADER_WIDTH);
    const x0 = Math.max(0, scrollLeft);
    const x1 = x0 + bodyW;
    let start = 0;
    while (start < COL_COUNT - 1 && colOffsets[start + 1] <= x0) start += 1;
    let end = start;
    while (end < COL_COUNT && colOffsets[end] < x1) end += 1;
    return {
      start: Math.max(0, start - 1),
      end: Math.min(COL_COUNT, end + 1),
    };
  }, [scrollLeft, colOffsets, viewportSize.w]);

  const cellValue = useCallback(
    (rowIndex, colIndex) => {
      if (rowIndex < DATA_START_ROW) return "";
      if (colIndex === 0) {
        const projectIndex = rowIndex - DATA_START_ROW;
        if (projectIndex < projects.length) return projectLabel(projects[projectIndex]);
      }
      return "";
    },
    [projects]
  );

  const titleBandHeight = rowHeights[0] ?? baseRowHeight;
  const subHeadingRowHeight = rowHeights[1] ?? baseRowHeight;

  function blockWidth(startCol, colSpan) {
    let w = 0;
    for (let c = startCol; c < startCol + colSpan; c += 1) w += colWidths[c] ?? DEFAULT_COL_WIDTH;
    return w;
  }

  function startColResize(colIndex, e) {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = {
      type: "col",
      index: colIndex,
      startPos: e.clientX,
      startSize: colWidths[colIndex],
    };
  }

  function startRowResize(rowIndex, e) {
    e.preventDefault();
    e.stopPropagation();
    userResizedRowsRef.current = true;
    resizeRef.current = {
      type: "row",
      index: rowIndex,
      startPos: e.clientY,
      startSize: rowHeights[rowIndex] ?? baseRowHeight,
    };
  }

  function selectCell(row, col, e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setSelectedCell({ row, col });
  }

  const selectedRow = selectedCell?.row ?? null;
  const selectedCol = selectedCell?.col ?? null;
  const isSelected = (row, col) => selectedRow === row && selectedCol === col;

  useEffect(() => {
    function onMove(e) {
      const active = resizeRef.current;
      if (!active) return;
      if (active.type === "col") {
        const next = Math.max(MIN_COL_WIDTH, active.startSize + (e.clientX - active.startPos));
        setColWidths((prev) => {
          if (prev[active.index] === next) return prev;
          const copy = prev.slice();
          copy[active.index] = next;
          return copy;
        });
      } else {
        const next = Math.max(MIN_ROW_HEIGHT, active.startSize + (e.clientY - active.startPos));
        setRowHeights((prev) => {
          if (prev[active.index] === next) return prev;
          const copy = prev.slice();
          copy[active.index] = next;
          return copy;
        });
      }
    }
    function onUp(e) {
      const active = resizeRef.current;
      if (!active) return;
      if (active.type === "col") {
        const next = Math.max(MIN_COL_WIDTH, active.startSize + (e.clientX - active.startPos));
        setColWidths((prev) => {
          const copy = prev.slice();
          copy[active.index] = next;
          queueSaveLayout(copy, rowHeightsRef.current, userResizedRowsRef.current);
          return copy;
        });
      } else {
        const next = Math.max(MIN_ROW_HEIGHT, active.startSize + (e.clientY - active.startPos));
        userResizedRowsRef.current = true;
        setRowHeights((prev) => {
          const copy = prev.slice();
          copy[active.index] = next;
          queueSaveLayout(colWidthsRef.current, copy, true);
          return copy;
        });
      }
      resizeRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [queueSaveLayout]);

  const { start: rowStart, end: rowEnd } = visibleRowRange;
  const { start: colStart, end: colEnd } = visibleColRange;

  return (
    <div
      className="page-container"
      style={{
        position: "fixed",
        inset: 0,
        background: LIGHT_MONUMENT,
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
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          padding: "0 32px",
          boxSizing: "border-box",
          flexShrink: 0,
        }}
      >
        <Link to="/projects" style={{ position: "absolute", left: "40px", cursor: "pointer" }}>
          <img src={logo} alt="SGF Logo" style={{ width: "120px", height: "auto" }} />
        </Link>
        <h1 style={{ margin: 0, fontSize: "2.4rem", fontWeight: 700, color: PAGE_TEXT, letterSpacing: "1px" }}>
          Managers
        </h1>
      </div>

      <div
        style={{
          display: "flex",
          width: "calc(100vw - 64px)",
          margin: "0 auto 24px auto",
          gap: "32px",
          flex: 1,
          minHeight: 0,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            background: SECTION_GREY,
            borderRadius: "16px",
            width: "200px",
            minWidth: "200px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
            padding: "32px 12px",
            boxSizing: "border-box",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: "18px",
            overflowY: "auto",
            alignSelf: "stretch",
          }}
        >
          <Link to="/managers/site-visit-manager" style={inactiveLinkStyle}>
            Site Visit Manager
          </Link>
          <Link to="/managers/contract-manager" style={inactiveLinkStyle}>
            Contract Manager
          </Link>
          <Link to="/managers/colour-manager" style={inactiveLinkStyle}>
            Colour Manager
          </Link>
          <Link to="/managers/status-manager" style={inactiveLinkStyle}>
            Status Manager
          </Link>
          <Link to="/managers/planning-manager" style={activeLinkStyle}>
            Planning Manager
          </Link>
          {isAdmin ? (
            <Link to="/managers/drawing-manager" style={inactiveLinkStyle}>
              Drawing Manager
            </Link>
          ) : null}
          <div style={{ flex: 1 }} />
          <Link to="/projects" style={inactiveLinkStyle}>
            ← Back to Main
          </Link>
        </div>

        <div
          style={{
            background: WHITE,
            borderRadius: "12px",
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            border: `1px solid ${HEADER_GRID_LINE}`,
          }}
        >
          {(loading || error || !sheetReady) && (
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${HEADER_GRID_LINE}`, flexShrink: 0 }}>
              {!sheetReady || loading ? (
                <span style={{ color: UI.textMuted }}>Loading sheet…</span>
              ) : null}
              {error ? <span style={{ color: "#cc3333" }}>{error}</span> : null}
            </div>
          )}

          {!sheetReady ? (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                background: WHITE,
              }}
            />
          ) : (
          <div
            ref={sheetViewportRef}
            onScroll={(e) => {
              setScrollTop(e.currentTarget.scrollTop);
              setScrollLeft(e.currentTarget.scrollLeft);
            }}
            style={{
              flex: 1,
              minHeight: 0,
              overflow: "auto",
              background: WHITE,
              fontFamily: "Calibri, Candara, Segoe UI, Arial, sans-serif",
              fontSize: "14px",
              userSelect: "none",
            }}
          >
            {/* Sticky column header */}
            <div
              style={{
                position: "sticky",
                top: 0,
                zIndex: 8,
                display: "flex",
                height: COL_HEADER_HEIGHT,
                width: ROW_HEADER_WIDTH + totalWidth,
                background: HEADER_BG,
                borderBottom: `1px solid ${HEADER_GRID_LINE}`,
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 6,
                  width: ROW_HEADER_WIDTH,
                  minWidth: ROW_HEADER_WIDTH,
                  height: COL_HEADER_HEIGHT,
                  background: HEADER_BG,
                  borderRight: `1px solid ${HEADER_GRID_LINE}`,
                  boxSizing: "border-box",
                  flexShrink: 0,
                }}
              />
              {COL_LETTERS.map((letter, colIndex) => {
                const colSelected = selectedCol === colIndex;
                return (
                <div
                  key={letter}
                  style={{
                    position: colIndex === 0 ? "sticky" : "relative",
                    left: colIndex === 0 ? ROW_HEADER_WIDTH : undefined,
                    zIndex: colIndex === 0 ? 6 : 2,
                    width: colWidths[colIndex],
                    minWidth: colWidths[colIndex],
                    height: COL_HEADER_HEIGHT,
                    borderRight: `1px solid ${HEADER_GRID_LINE}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: HEADER_TEXT,
                    fontWeight: 600,
                    fontSize: "13px",
                    boxSizing: "border-box",
                    flexShrink: 0,
                    background: colSelected
                      ? HEADER_SELECT_BG
                      : HEADER_BG,
                  }}
                >
                  {letter}
                  <div
                    onPointerDown={(e) => startColResize(colIndex, e)}
                    style={{
                      position: "absolute",
                      top: 0,
                      right: -3,
                      width: 6,
                      height: "100%",
                      cursor: "col-resize",
                      zIndex: 2,
                    }}
                  />
                </div>
                );
              })}
            </div>

            {/* Virtualized body */}
            <div style={{ position: "relative", height: totalHeight, width: ROW_HEADER_WIDTH + totalWidth }}>
              {/* Row 1: title headings (frozen) */}
              <div
                style={{
                  position: "sticky",
                  top: COL_HEADER_HEIGHT,
                  zIndex: 5,
                  display: "flex",
                  height: titleBandHeight,
                  width: ROW_HEADER_WIDTH + totalWidth,
                  boxSizing: "border-box",
                  background: TITLE_BAND_BG,
                }}
              >
                <div
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 7,
                    width: ROW_HEADER_WIDTH,
                    minWidth: ROW_HEADER_WIDTH,
                    height: titleBandHeight,
                    flexShrink: 0,
                    background: selectedRow === 0 ? HEADER_SELECT_BG : HEADER_BG,
                    borderRight: `1px solid ${HEADER_GRID_LINE}`,
                    borderBottom: `1px solid ${HEADER_GRID_LINE}`,
                    boxSizing: "border-box",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: HEADER_TEXT,
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  <span style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    1
                    <div
                      onPointerDown={(e) => startRowResize(0, e)}
                      style={{
                        position: "absolute",
                        left: 0,
                        bottom: -3,
                        width: "100%",
                        height: 6,
                        cursor: "row-resize",
                        zIndex: 2,
                      }}
                    />
                  </span>
                </div>

                {SHEET_TITLE_BLOCKS.map((block) => {
                  const w = blockWidth(block.startCol, block.colSpan);
                  const isColA = block.startCol === 0;
                  const selected = isSelected(0, block.startCol);
                  return (
                    <div
                      key={`title-${block.startCol}`}
                      title={block.label || undefined}
                      onClick={(e) => selectCell(0, block.startCol, e)}
                      style={{
                        position: isColA ? "sticky" : "relative",
                        left: isColA ? ROW_HEADER_WIDTH : undefined,
                        zIndex: selected ? 6 : isColA ? 6 : 1,
                        width: w,
                        minWidth: w,
                        height: titleBandHeight,
                        borderRight: `1px solid ${GRID_LINE}`,
                        borderBottom: `1px solid ${GRID_LINE}`,
                        boxSizing: "border-box",
                        padding: "4px 8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        textAlign: "center",
                        color: HEADING_BLUE,
                        fontWeight: 700,
                        fontSize: "13px",
                        lineHeight: 1.25,
                        background: isColA ? COL_A_FILL : TITLE_BAND_BG,
                        boxShadow: selected ? SELECTION_OUTLINE : undefined,
                        flexShrink: 0,
                        overflow: "hidden",
                        cursor: "cell",
                      }}
                    >
                      {block.label}
                    </div>
                  );
                })}
              </div>

              {/* Row 2: Sent / Received under paired headings */}
              <div
                style={{
                  display: "flex",
                  height: subHeadingRowHeight,
                  width: ROW_HEADER_WIDTH + totalWidth,
                  boxSizing: "border-box",
                  background: HEADER_BG,
                }}
              >
                <div
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 3,
                    width: ROW_HEADER_WIDTH,
                    minWidth: ROW_HEADER_WIDTH,
                    height: subHeadingRowHeight,
                    flexShrink: 0,
                    background: selectedRow === 1 ? HEADER_SELECT_BG : HEADER_BG,
                    borderRight: `1px solid ${HEADER_GRID_LINE}`,
                    borderBottom: `1px solid ${HEADER_GRID_LINE}`,
                    boxSizing: "border-box",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: HEADER_TEXT,
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  <span style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    2
                    <div
                      onPointerDown={(e) => startRowResize(1, e)}
                      style={{
                        position: "absolute",
                        left: 0,
                        bottom: -3,
                        width: "100%",
                        height: 6,
                        cursor: "row-resize",
                        zIndex: 2,
                      }}
                    />
                  </span>
                </div>
                {Array.from({ length: COL_COUNT }, (_, colIndex) => {
                  const label = ROW2_SUBHEADINGS[colIndex];
                  const selected = isSelected(1, colIndex);
                  return (
                    <div
                      key={`sub-${colIndex}`}
                      onClick={(e) => selectCell(1, colIndex, e)}
                      style={{
                        position: colIndex === 0 ? "sticky" : "relative",
                        left: colIndex === 0 ? ROW_HEADER_WIDTH : undefined,
                        zIndex: selected ? 5 : colIndex === 0 ? 4 : 1,
                        width: colWidths[colIndex],
                        minWidth: colWidths[colIndex],
                        height: subHeadingRowHeight,
                        borderRight: `1px solid ${GRID_LINE}`,
                        borderBottom: `1px solid ${GRID_LINE}`,
                        boxSizing: "border-box",
                        background: colIndex === 0 ? COL_A_FILL : HEADER_BG,
                        boxShadow: selected ? SELECTION_OUTLINE : undefined,
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: HEADING_BLUE,
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: "cell",
                      }}
                    >
                      {label}
                    </div>
                  );
                })}
              </div>

              {/* Data rows from row 3 */}
              <div style={{ height: Math.max(0, rowOffsets[Math.max(rowStart, DATA_START_ROW)] - rowOffsets[DATA_START_ROW]) }} />
              {Array.from(
                { length: Math.max(0, rowEnd - Math.max(rowStart, DATA_START_ROW)) },
                (_, i) => {
                const rowIndex = Math.max(rowStart, DATA_START_ROW) + i;
                const h = rowHeights[rowIndex] ?? baseRowHeight;
                const rowIsSelected = selectedRow === rowIndex;
                return (
                  <div
                    key={rowIndex}
                    style={{
                      display: "flex",
                      height: h,
                      width: ROW_HEADER_WIDTH + totalWidth,
                      boxSizing: "border-box",
                    }}
                  >
                    <div
                      style={{
                        position: "sticky",
                        left: 0,
                        zIndex: 4,
                        width: ROW_HEADER_WIDTH,
                        minWidth: ROW_HEADER_WIDTH,
                        height: h,
                        background: rowIsSelected ? HEADER_SELECT_BG : HEADER_BG,
                        borderRight: `1px solid ${HEADER_GRID_LINE}`,
                        borderBottom: `1px solid ${HEADER_GRID_LINE}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: HEADER_TEXT,
                        fontSize: "12px",
                        fontWeight: 600,
                        boxSizing: "border-box",
                        flexShrink: 0,
                      }}
                    >
                      <span style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {rowIndex + 1}
                        <div
                          onPointerDown={(e) => startRowResize(rowIndex, e)}
                          style={{
                            position: "absolute",
                            left: 0,
                            bottom: -3,
                            width: "100%",
                            height: 6,
                            cursor: "row-resize",
                            zIndex: 2,
                          }}
                        />
                      </span>
                    </div>

                    {/* Frozen column A */}
                    <div
                      title={cellValue(rowIndex, 0) || undefined}
                      onClick={(e) => selectCell(rowIndex, 0, e)}
                      style={{
                        position: "sticky",
                        left: ROW_HEADER_WIDTH,
                        zIndex: isSelected(rowIndex, 0) ? 5 : 3,
                        width: colWidths[0],
                        minWidth: colWidths[0],
                        height: h,
                        borderRight: `1px solid ${GRID_LINE}`,
                        borderBottom: `1px solid ${GRID_LINE}`,
                        boxSizing: "border-box",
                        padding: "0 6px 2px",
                        display: "flex",
                        alignItems: "flex-end",
                        justifyContent: "flex-start",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                        color: ADDRESS_TEXT,
                        fontWeight: 700,
                        fontSize: "14px",
                        background: COL_A_FILL,
                        boxShadow: isSelected(rowIndex, 0) ? SELECTION_OUTLINE : undefined,
                        flexShrink: 0,
                        cursor: "cell",
                      }}
                    >
                      {cellValue(rowIndex, 0)}
                    </div>

                    {colStart > 1 ? (
                      <div style={{ width: colOffsets[colStart] - colOffsets[1], flexShrink: 0 }} />
                    ) : null}

                    {Array.from(
                      { length: Math.max(0, colEnd - Math.max(colStart, 1)) },
                      (_, j) => {
                      const colIndex = Math.max(colStart, 1) + j;
                      const value = cellValue(rowIndex, colIndex);
                      const selected = isSelected(rowIndex, colIndex);
                      return (
                        <div
                          key={colIndex}
                          title={value || undefined}
                          onClick={(e) => selectCell(rowIndex, colIndex, e)}
                          style={{
                            position: "relative",
                            zIndex: selected ? 2 : 0,
                            width: colWidths[colIndex],
                            minWidth: colWidths[colIndex],
                            height: h,
                            borderRight: `1px solid ${GRID_LINE}`,
                            borderBottom: `1px solid ${GRID_LINE}`,
                            boxSizing: "border-box",
                            padding: "0 6px 2px",
                            display: "flex",
                            alignItems: "flex-end",
                            justifyContent: "flex-start",
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                            textOverflow: "ellipsis",
                            color: MONUMENT,
                            fontWeight: 400,
                            fontSize: "14px",
                            background: WHITE,
                            boxShadow: selected ? SELECTION_OUTLINE : undefined,
                            flexShrink: 0,
                            cursor: "cell",
                          }}
                        >
                          {value}
                        </div>
                      );
                    })}

                    {colEnd < COL_COUNT ? (
                      <div style={{ width: totalWidth - colOffsets[colEnd], flexShrink: 0 }} />
                    ) : null}
                  </div>
                );
              })}
              <div style={{ height: Math.max(0, totalHeight - rowOffsets[Math.max(rowEnd, DATA_START_ROW)]) }} />
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
