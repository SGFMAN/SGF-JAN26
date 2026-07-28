import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { isUserAdmin, getApiHeaders } from "../utils/auth";
import useAppLogo from "../hooks/useAppLogo.js";
import { UI } from "../utils/uiThemeTokens.js";
import { CLASSIFICATION_ABBREV_MAP } from "../utils/classifications";
import {
  DRAFTSPERSON_UNASSIGNED,
  normalizeDraftspersonField,
  isDraftspersonAssigned,
} from "../utils/draftspersonSentinel";
import { isHotlistStatus, isCancelledStatus } from "../utils/projectStatus";
import {
  getPlanningManagerColMapping,
  formatPlanningManagerSheetDate,
  planningManagerTodayIsoDate,
} from "../utils/planningManagerColumnFields";

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
const CANCELLED_TEXT = "#ff0000";
const COL_A_FILL = "rgb(218, 242, 208)";
const COL_YELLOW = "rgb(255, 230, 153)";
const COL_LIGHT_BLUE = HEADER_SELECT_BG;
const COL_BAL_FILL = "rgb(198, 89, 17)";
const SELECTION_OUTLINE = `inset 0 0 0 2px ${HEADING_BLUE}`;
const API_URL = "";

const COL_COUNT = 78; // A–BZ
const ROW_COUNT = 500;
const VISIBLE_ROWS = 23;
const DATA_START_ROW = 2; // row 1 = titles; row 2 reserved for Sent/Received later
const ROW_HEADER_WIDTH = 48;
const DEFAULT_COL_WIDTH = 96;
const COL_A_DEFAULT_WIDTH = 220;
const MIN_COL_WIDTH = 40;
const MIN_ROW_HEIGHT = 16;
const COL_HEADER_HEIGHT = 28;
const TITLE_BAND_BG = "#e8e8e8";
const SHEET_FONT = "Calibri, Candara, Segoe UI, Arial, sans-serif";
const SHEET_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Fallback display for legacy blob cells (cols not yet mapped to project fields). */
function formatSheetDate(date = new Date()) {
  const dd = String(date.getDate()).padStart(2, "0");
  return `${dd}-${SHEET_MONTHS[date.getMonth()]}`;
}

/**
 * Row 1 merged title cells (0-based col indices).
 * Optional row2[] fills subheadings under each spanned column.
 * colSpan 2 with no row2 defaults to Sent | Received.
 */
const SHEET_TITLE_BLOCKS = [
  { startCol: 0, colSpan: 1, label: "Project Address" }, // A
  { startCol: 1, colSpan: 1, label: "DRAFTSPERSON" }, // B
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

/** Column body/title fill (null = default band/white). */
function columnFill(colIndex) {
  if (colIndex === 0) return COL_A_FILL;
  if (colIndex === 1) return COL_YELLOW; // Draftsperson
  if (colIndex === 18) return COL_LIGHT_BLUE; // Job File Created
  if (colIndex === 36 || colIndex === 37) return COL_BAL_FILL; // BAL Required
  if (colIndex === 40) return COL_YELLOW; // Energy Specs Added to Plans
  if (colIndex === 41 || colIndex === 42) return COL_LIGHT_BLUE; // Windows
  if (colIndex === 47 || colIndex === 48) return COL_A_FILL; // Building Permit
  return null;
}


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

/** SUBURB - Street (SSD) — classification acronym from project rectangles. */
function projectLabel(project) {
  const suburb = project?.suburb != null ? String(project.suburb).trim() : "";
  const street = project?.street != null ? String(project.street).trim() : "";
  const classification = project?.classification != null ? String(project.classification).trim() : "";
  const abbrevRaw = classification ? CLASSIFICATION_ABBREV_MAP[classification] : "";
  const abbrev = abbrevRaw ? String(abbrevRaw).toUpperCase() : "";

  if (suburb || street) {
    const suburbOut = suburb.toUpperCase();
    let address = "";
    if (suburbOut && street) address = `${suburbOut} - ${street}`;
    else address = suburbOut || street;
    if (abbrev) return `${address} (${abbrev})`;
    return address;
  }
  const name = project?.name != null ? String(project.name).trim() : "";
  if (name) return abbrev ? `${name} (${abbrev})` : name;
  return `Project #${project?.id ?? ""}`;
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
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const next = [];
  for (let i = 0; i < ROW_COUNT; i += 1) {
    const source = i < raw.length ? raw[i] : raw[raw.length - 1];
    const n = Number(source);
    if (!Number.isFinite(n)) return null;
    next.push(Math.max(MIN_ROW_HEIGHT, Math.round(n)));
  }
  return next;
}

function sanitizeProjectOrder(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  const seen = new Set();
  for (const v of raw) {
    const n = Number(v);
    if (!Number.isFinite(n) || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out.length ? out : null;
}

function normalizeLayoutPayload(raw) {
  if (!raw || typeof raw !== "object") return null;
  const colWidths = sanitizeColWidths(raw.colWidths);
  const rowsCustomized = Boolean(raw.rowsCustomized);
  const rowHeights = rowsCustomized ? sanitizeRowHeights(raw.rowHeights) : null;
  const projectOrder = sanitizeProjectOrder(raw.projectOrder);
  if (!colWidths && !rowHeights && !projectOrder) return null;
  return {
    colWidths,
    rowHeights,
    rowsCustomized: Boolean(rowHeights),
    projectOrder,
  };
}

function applyProjectOrder(list, projectOrder) {
  const items = Array.isArray(list) ? [...list] : [];
  const alphaSort = (a, b) =>
    projectLabel(a).localeCompare(projectLabel(b), undefined, { sensitivity: "base" });
  if (!projectOrder?.length) {
    items.sort(alphaSort);
    return items;
  }
  const byId = new Map(items.map((p) => [Number(p.id), p]));
  const ordered = [];
  const used = new Set();
  for (const id of projectOrder) {
    const p = byId.get(Number(id));
    if (!p || used.has(p.id)) continue;
    ordered.push(p);
    used.add(p.id);
  }
  const rest = items.filter((p) => !used.has(p.id));
  rest.sort(alphaSort);
  return [...ordered, ...rest];
}

async function fetchSharedLayout() {
  const res = await fetch(`${API_URL}/api/planning-manager-layout`, {
    headers: getApiHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to load sheet layout (${res.status})`);
  const data = await res.json().catch(() => ({}));
  return normalizeLayoutPayload(data.layout);
}

async function persistSharedLayout(colWidths, rowHeights, rowsCustomized, projectOrder) {
  const layout = {
    colWidths,
    rowsCustomized: Boolean(rowsCustomized),
    rowHeights: rowsCustomized ? rowHeights : undefined,
  };
  if (projectOrder !== undefined) {
    layout.projectOrder = projectOrder;
  }
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

async function fetchSharedCells() {
  const res = await fetch(`${API_URL}/api/planning-manager-cells`, {
    headers: getApiHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to load sheet cells (${res.status})`);
  const data = await res.json().catch(() => ({}));
  return data.cells && typeof data.cells === "object" ? data.cells : {};
}

async function persistCellValue(projectId, colIndex, value) {
  const res = await fetch(`${API_URL}/api/planning-manager-cells`, {
    method: "PUT",
    headers: getApiHeaders(),
    body: JSON.stringify({ projectId, colIndex, value }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to save cell (${res.status})`);
  }
  const data = await res.json().catch(() => ({}));
  return data.cells && typeof data.cells === "object" ? data.cells : null;
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
  const [draftspersonUsers, setDraftspersonUsers] = useState([]);
  const [draftspersonMenu, setDraftspersonMenu] = useState(null); // { projectId, top, left, width }
  const [sheetCells, setSheetCells] = useState({}); // { [projectId]: { [colIndex]: value } }
  const [moveRowModal, setMoveRowModal] = useState(null); // { projectIndex, label, inputValue } | null
  const [projectSearch, setProjectSearch] = useState("");
  const projectOrderRef = useRef(null);
  const projectsRef = useRef(projects);
  const moveRowInputRef = useRef(null);
  projectsRef.current = projects;

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
      persistSharedLayout(
        nextCols,
        nextRows,
        rowsCustomized,
        projectOrderRef.current ?? undefined
      ).catch((err) => {
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
        const usersResponse = await fetch(`${API_URL}/api/users`, { headers: getApiHeaders() });
        if (!usersResponse.ok) throw new Error("Failed to fetch users");
        const allUsers = await usersResponse.json();
        if (cancelled) return;
        const draftspersons = (Array.isArray(allUsers) ? allUsers : []).filter((user) => {
          if (!user.positions || !Array.isArray(user.positions)) return false;
          return user.positions.some((position) => {
            const positionName = position.name ? position.name.toLowerCase() : "";
            return (
              positionName === "architectural draftsperson" ||
              positionName === "architectural graduate"
            );
          });
        });
        draftspersons.sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" })
        );
        setDraftspersonUsers(draftspersons);
      } catch (err) {
        console.error("Failed to load draftspersons:", err);
        if (!cancelled) setDraftspersonUsers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!draftspersonMenu) return undefined;
    function onDocPointerDown(e) {
      const t = e.target;
      if (t?.closest?.("[data-draftsperson-menu]") || t?.closest?.("[data-draftsperson-arrow]")) return;
      setDraftspersonMenu(null);
    }
    function onKey(e) {
      if (e.key === "Escape") setDraftspersonMenu(null);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [draftspersonMenu]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [projectsRes, layout, cells] = await Promise.all([
          fetch(`${API_URL}/api/projects`, { headers: getApiHeaders() }),
          fetchSharedLayout().catch((err) => {
            console.error("Failed to load planning manager layout:", err);
            return null;
          }),
          fetchSharedCells().catch((err) => {
            console.error("Failed to load planning manager cells:", err);
            return {};
          }),
        ]);
        if (!projectsRes.ok) throw new Error(`Failed to fetch projects: ${projectsRes.statusText}`);
        const data = await projectsRes.json();
        if (cancelled) return;
        const list = (Array.isArray(data) ? [...data] : []).filter((p) => {
          if (isHotlistStatus(p?.status)) return false;
          const state = String(p?.state || "").trim().toUpperCase();
          return state === "VIC" || state === "VICTORIA";
        });
        const ordered = applyProjectOrder(list, layout?.projectOrder);
        projectOrderRef.current = ordered.map((p) => p.id);
        setProjects(ordered);
        setSheetCells(cells && typeof cells === "object" ? cells : {});
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
      const projectIndex = rowIndex - DATA_START_ROW;
      if (projectIndex < 0 || projectIndex >= projects.length) return "";
      const project = projects[projectIndex];
      if (colIndex === 0) return projectLabel(project);
      if (colIndex === 1) {
        const normalized = normalizeDraftspersonField(project?.draftsperson);
        if (!isDraftspersonAssigned(normalized)) return "";
        return normalized.toUpperCase();
      }
      const mapping = getPlanningManagerColMapping(colIndex);
      if (mapping?.field) {
        return formatPlanningManagerSheetDate(project?.[mapping.field]);
      }
      const stored = sheetCells?.[String(project.id)]?.[String(colIndex)];
      return stored != null ? String(stored) : "";
    },
    [projects, sheetCells]
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

  function openDraftspersonMenu(project, anchorEl) {
    if (!project?.id || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const menuWidth = Math.max(180, colWidths[1] || DEFAULT_COL_WIDTH);
    let left = rect.right - menuWidth;
    if (left < 8) left = 8;
    if (left + menuWidth > window.innerWidth - 8) left = Math.max(8, window.innerWidth - menuWidth - 8);
    let top = rect.bottom + 2;
    const estimatedH = Math.min(280, 36 + (draftspersonUsers.length + 1) * 32);
    if (top + estimatedH > window.innerHeight - 8) {
      top = Math.max(8, rect.top - estimatedH - 2);
    }
    setDraftspersonMenu({
      projectId: project.id,
      top,
      left,
      width: menuWidth,
    });
  }

  async function saveDraftsperson(project, selectedValue) {
    if (!project?.id) return;
    const newDraftsperson = normalizeDraftspersonField(selectedValue);
    const projectName =
      project.name || `${project.street || ""}, ${project.suburb || ""}`.trim() || "";
    const previous = project.draftsperson;

    setProjects((prev) =>
      prev.map((p) => (p.id === project.id ? { ...p, draftsperson: newDraftsperson } : p))
    );
    setDraftspersonMenu(null);

    try {
      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify({
          name: projectName,
          status: project.status || null,
          draftsperson: newDraftsperson,
        }),
      });
      if (!response.ok) throw new Error("Failed to update draftsperson");
    } catch (err) {
      console.error("Error updating draftsperson:", err);
      setProjects((prev) =>
        prev.map((p) => (p.id === project.id ? { ...p, draftsperson: previous } : p))
      );
      alert("Failed to update draftsperson");
    }
  }

  function reorderProject(fromIndex, toIndex) {
    const list = projectsRef.current;
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= list.length ||
      toIndex >= list.length
    ) {
      return;
    }
    const next = [...list];
    const [item] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, item);
    projectOrderRef.current = next.map((p) => Number(p.id));
    setProjects(next);
    queueSaveLayout(
      colWidthsRef.current,
      rowHeightsRef.current,
      userResizedRowsRef.current
    );
  }

  function openMoveRowModal(projectIndex) {
    if (projectIndex < 0 || projectIndex >= projects.length) return;
    const project = projects[projectIndex];
    const sheetRow = DATA_START_ROW + projectIndex + 1;
    selectCell(DATA_START_ROW + projectIndex, 0);
    setMoveRowModal({
      projectIndex,
      label: projectLabel(project) || "Project",
      inputValue: String(sheetRow),
    });
  }

  const projectSearchMatches = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return [];
    const out = [];
    for (let i = 0; i < projects.length; i += 1) {
      const label = projectLabel(projects[i]);
      if (!label || !label.toLowerCase().includes(q)) continue;
      out.push({
        projectIndex: i,
        label,
        sheetRow: DATA_START_ROW + i + 1,
        cancelled: isCancelledStatus(projects[i]?.status),
      });
      if (out.length >= 12) break;
    }
    return out;
  }, [projectSearch, projects]);

  function confirmMoveRowModal() {
    if (!moveRowModal) return;
    const rowNum = parseInt(String(moveRowModal.inputValue).trim(), 10);
    if (!Number.isFinite(rowNum)) {
      alert("Enter a valid row number");
      return;
    }
    const firstProjectRow = DATA_START_ROW + 1;
    const listLen = projectsRef.current.length;
    if (listLen <= 0) {
      setMoveRowModal(null);
      return;
    }
    const targetIndex = Math.max(0, Math.min(listLen - 1, rowNum - firstProjectRow));
    reorderProject(moveRowModal.projectIndex, targetIndex);
    setMoveRowModal(null);
  }

  async function stampDateOnCell(rowIndex, colIndex) {
    if (rowIndex < DATA_START_ROW || colIndex < 2) return;
    const projectIndex = rowIndex - DATA_START_ROW;
    if (projectIndex < 0 || projectIndex >= projects.length) return;
    const project = projects[projectIndex];
    if (!project?.id) return;

    const mapping = getPlanningManagerColMapping(colIndex);
    if (mapping?.readOnly) return;

    // Mapped project fields (C–R): store on the project so other pages can read them.
    if (mapping?.field) {
      const field = mapping.field;
      const previous = project[field] ?? null;
      const hasDate = previous != null && String(previous).trim() !== "";
      const nextValue = hasDate ? null : planningManagerTodayIsoDate();

      setProjects((prev) =>
        prev.map((p) => (p.id === project.id ? { ...p, [field]: nextValue } : p))
      );
      setSelectedCell({ row: rowIndex, col: colIndex });

      try {
        const res = await fetch(`${API_URL}/api/projects/${project.id}/planning-manager-date`, {
          method: "PUT",
          headers: getApiHeaders(),
          body: JSON.stringify({ field, value: nextValue }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Failed to save (${res.status})`);
        }
        const data = await res.json().catch(() => ({}));
        if (data && Object.prototype.hasOwnProperty.call(data, "value")) {
          setProjects((prev) =>
            prev.map((p) => (p.id === project.id ? { ...p, [field]: data.value } : p))
          );
        }
      } catch (err) {
        console.error("Error saving planning manager date:", err);
        setProjects((prev) =>
          prev.map((p) => (p.id === project.id ? { ...p, [field]: previous } : p))
        );
        alert(hasDate ? "Failed to clear date" : "Failed to save date");
      }
      return;
    }

    // Legacy blob cells for columns not yet mapped to project fields.
    const projectKey = String(project.id);
    const colKey = String(colIndex);
    const previous = sheetCells?.[projectKey]?.[colKey];
    const hasDate = previous != null && String(previous).trim() !== "";
    const nextValue = hasDate ? "" : formatSheetDate();

    setSheetCells((prev) => {
      const next = { ...prev, [projectKey]: { ...(prev[projectKey] || {}) } };
      if (!nextValue) {
        delete next[projectKey][colKey];
        if (!Object.keys(next[projectKey]).length) delete next[projectKey];
      } else {
        next[projectKey][colKey] = nextValue;
      }
      return next;
    });
    setSelectedCell({ row: rowIndex, col: colIndex });

    try {
      const saved = await persistCellValue(project.id, colIndex, nextValue || null);
      if (saved) setSheetCells(saved);
    } catch (err) {
      console.error("Error saving sheet date:", err);
      setSheetCells((prev) => {
        const next = { ...prev, [projectKey]: { ...(prev[projectKey] || {}) } };
        if (previous == null || previous === "") delete next[projectKey][colKey];
        else next[projectKey][colKey] = previous;
        if (!Object.keys(next[projectKey] || {}).length) delete next[projectKey];
        return next;
      });
      alert(hasDate ? "Failed to clear date" : "Failed to save date");
    }
  }

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
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [queueSaveLayout]);

  useEffect(() => {
    if (!moveRowModal) return undefined;
    const t = window.setTimeout(() => {
      moveRowInputRef.current?.focus?.();
      moveRowInputRef.current?.select?.();
    }, 0);
    function onKey(e) {
      if (e.key === "Escape") setMoveRowModal(null);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
    // Only when the modal opens for a project — not on each keystroke.
  }, [moveRowModal?.projectIndex]);

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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            flexWrap: "wrap",
            maxWidth: "calc(100% - 280px)",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "2.4rem", fontWeight: 700, color: PAGE_TEXT, letterSpacing: "1px" }}>
            Managers
          </h1>
          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              gap: 8,
              position: "relative",
              zIndex: 20,
            }}
          >
            <input
              type="search"
              value={projectSearch}
              placeholder="Search project…"
              onChange={(e) => setProjectSearch(e.target.value)}
              style={{
                width: 220,
                padding: "8px 12px",
                fontSize: 14,
                fontFamily: SHEET_FONT,
                border: `1px solid ${HEADER_GRID_LINE}`,
                borderRadius: 6,
                background: WHITE,
                color: ADDRESS_TEXT,
                boxSizing: "border-box",
              }}
            />
            {projectSearch.trim() ? (
              <div
                style={{
                  width: 320,
                  maxHeight: 280,
                  overflowY: "auto",
                  background: WHITE,
                  border: `1px solid ${HEADER_GRID_LINE}`,
                  borderRadius: 6,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
                }}
              >
                {projectSearchMatches.length === 0 ? (
                  <div
                    style={{
                      padding: "10px 12px",
                      fontSize: 13,
                      color: UI.textMuted,
                      fontFamily: SHEET_FONT,
                    }}
                  >
                    No matches
                  </div>
                ) : (
                  projectSearchMatches.map((match) => (
                    <button
                      key={`${match.projectIndex}-${match.sheetRow}`}
                      type="button"
                      title={match.label}
                      onClick={() => {
                        openMoveRowModal(match.projectIndex);
                        setProjectSearch("");
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "8px 12px",
                        border: "none",
                        borderBottom: `1px solid ${HEADER_GRID_LINE}`,
                        background: WHITE,
                        color: match.cancelled ? CANCELLED_TEXT : ADDRESS_TEXT,
                        fontSize: 13,
                        fontWeight: 600,
                        fontFamily: SHEET_FONT,
                        cursor: "pointer",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span style={{ color: HEADER_TEXT, fontWeight: 500, marginRight: 8 }}>
                        R{match.sheetRow}
                      </span>
                      {match.label}
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </div>
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
              setDraftspersonMenu(null);
            }}
            style={{
              flex: 1,
              minHeight: 0,
              overflow: "auto",
              background: WHITE,
              fontFamily: SHEET_FONT,
              fontSize: "15px",
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
                    fontSize: "14px",
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
                    fontSize: "13px",
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
                  const fill = columnFill(block.startCol);
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
                        fontWeight: 900,
                        fontSize: "14px",
                        lineHeight: 1.25,
                        fontFamily: SHEET_FONT,
                        WebkitTextStroke: "0.35px currentColor",
                        background: fill || TITLE_BAND_BG,
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
                    fontSize: "13px",
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
                  const fill = columnFill(colIndex);
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
                        background: fill || HEADER_BG,
                        boxShadow: selected ? SELECTION_OUTLINE : undefined,
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: HEADING_BLUE,
                        fontSize: "13px",
                        fontWeight: 900,
                        fontFamily: SHEET_FONT,
                        WebkitTextStroke: "0.3px currentColor",
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
                        fontSize: "13px",
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
                    {(() => {
                      const projectIndex = rowIndex - DATA_START_ROW;
                      const project =
                        projectIndex >= 0 && projectIndex < projects.length
                          ? projects[projectIndex]
                          : null;
                      const addressText = cellValue(rowIndex, 0);
                      const cancelled = isCancelledStatus(project?.status);
                      return (
                    <div
                      title={addressText || undefined}
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
                        color: cancelled ? CANCELLED_TEXT : ADDRESS_TEXT,
                        WebkitTextFillColor: cancelled ? CANCELLED_TEXT : ADDRESS_TEXT,
                        fontWeight: 900,
                        fontSize: "15px",
                        fontFamily: SHEET_FONT,
                        WebkitTextStroke: "0.35px currentColor",
                        background: COL_A_FILL,
                        boxShadow: isSelected(rowIndex, 0) ? SELECTION_OUTLINE : undefined,
                        flexShrink: 0,
                        cursor: "cell",
                      }}
                    >
                      {addressText}
                    </div>
                      );
                    })()}

                    {colStart > 1 ? (
                      <div style={{ width: colOffsets[colStart] - colOffsets[1], flexShrink: 0 }} />
                    ) : null}

                    {Array.from(
                      { length: Math.max(0, colEnd - Math.max(colStart, 1)) },
                      (_, j) => {
                      const colIndex = Math.max(colStart, 1) + j;
                      const value = cellValue(rowIndex, colIndex);
                      const selected = isSelected(rowIndex, colIndex);
                      const fill = columnFill(colIndex);
                      const projectIndex = rowIndex - DATA_START_ROW;
                      const project =
                        colIndex === 1 && projectIndex >= 0 && projectIndex < projects.length
                          ? projects[projectIndex]
                          : null;
                      const isDraftCol = colIndex === 1 && project;
                      return (
                        <div
                          key={colIndex}
                          title={value || undefined}
                          onClick={(e) => selectCell(rowIndex, colIndex, e)}
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (colIndex >= 2) stampDateOnCell(rowIndex, colIndex);
                          }}
                          style={{
                            position: "relative",
                            zIndex: selected ? 2 : 0,
                            width: colWidths[colIndex],
                            minWidth: colWidths[colIndex],
                            height: h,
                            borderRight: `1px solid ${GRID_LINE}`,
                            borderBottom: `1px solid ${GRID_LINE}`,
                            boxSizing: "border-box",
                            padding: isDraftCol ? "0 14px 2px 14px" : "0 6px 2px",
                            display: "flex",
                            alignItems: "flex-end",
                            justifyContent: isDraftCol ? "center" : "flex-start",
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                            textOverflow: "ellipsis",
                            color: colIndex === 1 ? ADDRESS_TEXT : MONUMENT,
                            fontWeight: colIndex === 1 ? 700 : 400,
                            fontSize: "15px",
                            fontFamily: SHEET_FONT,
                            background: fill || WHITE,
                            boxShadow: selected ? SELECTION_OUTLINE : undefined,
                            flexShrink: 0,
                            cursor: "cell",
                          }}
                        >
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              minWidth: 0,
                              flex: isDraftCol ? "0 1 auto" : 1,
                              textAlign: isDraftCol ? "center" : "left",
                            }}
                          >
                            {value}
                          </span>
                          {isDraftCol ? (
                            <button
                              type="button"
                              data-draftsperson-arrow
                              title="Select draftsperson"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                selectCell(rowIndex, colIndex);
                                openDraftspersonMenu(project, e.currentTarget);
                              }}
                              style={{
                                position: "absolute",
                                right: 1,
                                bottom: 1,
                                width: 12,
                                height: 10,
                                padding: 0,
                                margin: 0,
                                border: "none",
                                background: "transparent",
                                color: HEADER_TEXT,
                                fontSize: "8px",
                                lineHeight: 1,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                zIndex: 3,
                              }}
                            >
                              ▼
                            </button>
                          ) : null}
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

      {draftspersonMenu ? (
        <div
          data-draftsperson-menu
          style={{
            position: "fixed",
            top: draftspersonMenu.top,
            left: draftspersonMenu.left,
            width: draftspersonMenu.width,
            maxHeight: 280,
            overflowY: "auto",
            zIndex: 10000,
            background: WHITE,
            border: `1px solid ${HEADER_GRID_LINE}`,
            boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
            borderRadius: "4px",
          }}
        >
          {(() => {
            const project = projects.find((p) => p.id === draftspersonMenu.projectId);
            const current = normalizeDraftspersonField(project?.draftsperson);
            const options = [
              { value: DRAFTSPERSON_UNASSIGNED, label: "None" },
              ...draftspersonUsers.map((dp) => ({
                value: dp.name || "",
                label: (dp.name || "").toUpperCase(),
              })),
            ];
            return options.map((opt) => {
              const active = current === normalizeDraftspersonField(opt.value);
              return (
                <button
                  key={opt.value || "none"}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (project) saveDraftsperson(project, opt.value);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 10px",
                    border: "none",
                    borderBottom: `1px solid ${HEADER_GRID_LINE}`,
                    background: active ? COL_YELLOW : WHITE,
                    color: ADDRESS_TEXT,
                    fontSize: "13px",
                    fontWeight: active ? 700 : 500,
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              );
            });
          })()}
        </div>
      ) : null}

      {moveRowModal ? (
        <div
          role="presentation"
          onClick={() => setMoveRowModal(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10050,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Move project to row"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 360,
              background: WHITE,
              borderRadius: 8,
              border: `1px solid ${HEADER_GRID_LINE}`,
              boxShadow: "0 12px 40px rgba(0,0,0,0.22)",
              padding: "20px 22px",
              fontFamily: SHEET_FONT,
            }}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: ADDRESS_TEXT,
                marginBottom: 6,
              }}
            >
              Move to row
            </div>
            <div
              style={{
                fontSize: 13,
                color: HEADER_TEXT,
                marginBottom: 14,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={moveRowModal.label}
            >
              {moveRowModal.label}
            </div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: HEADER_TEXT,
                marginBottom: 6,
              }}
            >
              Row number
            </label>
            <input
              ref={moveRowInputRef}
              type="number"
              min={DATA_START_ROW + 1}
              step={1}
              value={moveRowModal.inputValue}
              onChange={(e) =>
                setMoveRowModal((prev) =>
                  prev ? { ...prev, inputValue: e.target.value } : prev
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmMoveRowModal();
                }
              }}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "8px 10px",
                fontSize: 16,
                fontFamily: SHEET_FONT,
                border: `1px solid ${HEADER_GRID_LINE}`,
                borderRadius: 4,
                marginBottom: 16,
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setMoveRowModal(null)}
                style={{
                  padding: "8px 14px",
                  border: `1px solid ${HEADER_GRID_LINE}`,
                  borderRadius: 4,
                  background: WHITE,
                  color: ADDRESS_TEXT,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmMoveRowModal}
                style={{
                  padding: "8px 14px",
                  border: "none",
                  borderRadius: 4,
                  background: HEADING_BLUE,
                  color: WHITE,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Move
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
