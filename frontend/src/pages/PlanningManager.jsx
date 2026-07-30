import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getApiHeaders } from "../utils/auth";
import { useDrawingAccess } from "../hooks/useDrawingAccess";
import useAppLogo from "../hooks/useAppLogo.js";
import { UI } from "../utils/uiThemeTokens.js";
import { CLASSIFICATION_ABBREV_MAP } from "../utils/classifications";
import { collapseLinkedProjectsForPlanning } from "../utils/duplicateProjectLinks";
import {
  DRAFTSPERSON_UNASSIGNED,
  normalizeDraftspersonField,
  isDraftspersonAssigned,
} from "../utils/draftspersonSentinel";
import { isHotlistStatus, isCancelledStatus, isOnHoldFlag } from "../utils/projectStatus";
import { projectPath } from "../utils/projectUrl";
import {
  getPlanningManagerColMapping,
  formatPlanningManagerSheetDate,
  planningManagerTodayIsoDate,
  isPlanningManagerDropdownCol,
  getPlanningManagerDropdownOptions,
  planningManagerCellAllowsManualDate,
  planningManagerCellAllowsFreeEdit,
} from "../utils/planningManagerColumnFields";
import { normalizeProjectYearToISO } from "../utils/salesTotalsCompute";

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
const ROW_COUNT = 200;
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

/** Classification acronym from project rectangles (e.g. SSD, REN). */
function classificationAbbrev(project) {
  const classification = project?.classification != null ? String(project.classification).trim() : "";
  const abbrevRaw = classification ? CLASSIFICATION_ABBREV_MAP[classification] : "";
  return abbrevRaw ? String(abbrevRaw).toUpperCase() : "";
}

/** SUBURB - Street (SSD)(REN) — linked jobs share one row with both acronyms. */
function projectLabel(project) {
  const suburb = project?.suburb != null ? String(project.suburb).trim() : "";
  const street = project?.street != null ? String(project.street).trim() : "";
  const partner = project?._planningLinkPartner;
  const abbrevs = [];
  const primaryAbbrev = classificationAbbrev(project);
  if (primaryAbbrev) abbrevs.push(primaryAbbrev);
  const partnerAbbrev = classificationAbbrev(partner);
  if (partnerAbbrev && !abbrevs.includes(partnerAbbrev)) abbrevs.push(partnerAbbrev);
  const abbrevSuffix = abbrevs.map((a) => `(${a})`).join("");

  let label = "";
  if (suburb || street) {
    const suburbOut = suburb.toUpperCase();
    let address = "";
    if (suburbOut && street) address = `${suburbOut} - ${street}`;
    else address = suburbOut || street;
    label = abbrevSuffix ? `${address} ${abbrevSuffix}` : address;
  } else {
    const name = project?.name != null ? String(project.name).trim() : "";
    if (name) label = abbrevSuffix ? `${name} ${abbrevSuffix}` : name;
    else label = `Project #${project?.id ?? ""}`;
  }

  if (isOnHoldFlag(project) || isOnHoldFlag(partner)) label = `${label} (ON HOLD)`;
  if (isCancelledStatus(project?.status) || isCancelledStatus(partner?.status)) {
    label = `${label} (CANCELLED)`;
  }
  return label;
}

function projectShowsRed(project) {
  if (isCancelledStatus(project?.status) || isOnHoldFlag(project)) return true;
  const partner = project?._planningLinkPartner;
  return Boolean(partner && (isCancelledStatus(partner?.status) || isOnHoldFlag(partner)));
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

function sanitizeProjectOrders(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out = {};
  for (const [key, val] of Object.entries(raw)) {
    const k = String(key || "").trim();
    if (!k) continue;
    const order = sanitizeProjectOrder(val);
    if (order) out[k] = order;
  }
  return Object.keys(out).length ? out : null;
}

function sanitizeActiveTab(raw) {
  const s = String(raw || "").trim();
  if (!/^(VIC|QLD) \d{4}$/.test(s)) return null;
  return s;
}

/** Only VIC 2025 keeps the migrated custom order by default; other tabs date-sort until manually reordered. */
const SEEDED_CUSTOM_ORDER_TAB = "VIC 2025";

function normalizeProjectState(state) {
  const s = String(state || "").trim().toUpperCase();
  if (s === "VIC" || s === "VICTORIA") return "VIC";
  if (s === "QLD" || s === "QUEENSLAND") return "QLD";
  return null;
}

function projectCalendarYear(project) {
  const iso = normalizeProjectYearToISO(project?.year);
  if (iso) return parseInt(iso.slice(0, 4), 10);
  if (project?.year == null || project.year === "") return null;
  const y = String(project.year).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(y)) return parseInt(y.slice(0, 4), 10);
  if (/^\d{4}$/.test(y)) return parseInt(y, 10);
  return null;
}

function projectTabKey(project) {
  const state = normalizeProjectState(project?.state);
  const year = projectCalendarYear(project);
  if (!state || !year) return null;
  return `${state} ${year}`;
}

function buildSheetTabs(projectList) {
  const keys = new Set();
  for (const p of projectList || []) {
    const key = projectTabKey(p);
    if (key) keys.add(key);
  }
  const stateRank = { VIC: 0, QLD: 1 };
  return Array.from(keys).sort((a, b) => {
    const [as, ay] = a.split(" ");
    const [bs, by] = b.split(" ");
    const sr = (stateRank[as] ?? 99) - (stateRank[bs] ?? 99);
    if (sr !== 0) return sr;
    return Number(ay) - Number(by);
  });
}

function sanitizeCustomizedTabs(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const v of raw) {
    const s = sanitizeActiveTab(v);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function normalizeLayoutPayload(raw) {
  if (!raw || typeof raw !== "object") return null;
  const colWidths = sanitizeColWidths(raw.colWidths);
  const rowsCustomized = Boolean(raw.rowsCustomized);
  const rowHeights = rowsCustomized ? sanitizeRowHeights(raw.rowHeights) : null;
  const legacyOrder = sanitizeProjectOrder(raw.projectOrder);
  let projectOrders = sanitizeProjectOrders(raw.projectOrders);
  if (legacyOrder?.length) {
    projectOrders = { ...(projectOrders || {}) };
    if (!projectOrders[SEEDED_CUSTOM_ORDER_TAB]?.length) {
      projectOrders[SEEDED_CUSTOM_ORDER_TAB] = legacyOrder;
    }
  }
  const activeTab = sanitizeActiveTab(raw.activeTab);
  const customizedTabs = sanitizeCustomizedTabs(raw.customizedTabs);
  if (!colWidths && !rowHeights && !projectOrders && !activeTab) return null;
  return {
    colWidths,
    rowHeights,
    rowsCustomized: Boolean(rowHeights),
    projectOrders,
    activeTab,
    customizedTabs,
  };
}

function projectStartDateKey(project) {
  const iso = normalizeProjectYearToISO(project?.year);
  if (iso) return iso;
  if (project?.updated_at) {
    const u = String(project.updated_at).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(u)) return u.slice(0, 10);
  }
  // Stable fallback so equal/missing dates don't reshuffle as alphabetical suburb order.
  const id = Number(project?.id);
  return Number.isFinite(id) ? `9999-99-99-${String(id).padStart(8, "0")}` : "9999-99-99-99999999";
}

function applyProjectOrder(list, projectOrder) {
  const items = Array.isArray(list) ? [...list] : [];
  const dateSort = (a, b) => {
    const byDate = projectStartDateKey(a).localeCompare(projectStartDateKey(b));
    if (byDate !== 0) return byDate;
    const ida = Number(a?.id) || 0;
    const idb = Number(b?.id) || 0;
    return ida - idb;
  };
  if (!projectOrder?.length) {
    items.sort(dateSort);
    return items;
  }
  // Map both primary and linked-partner ids to the collapsed row.
  const byId = new Map();
  for (const p of items) {
    byId.set(Number(p.id), p);
    const partnerId = Number(p?._planningLinkPartner?.id);
    if (Number.isFinite(partnerId)) byId.set(partnerId, p);
  }
  const ordered = [];
  const used = new Set();
  for (const id of projectOrder) {
    const p = byId.get(Number(id));
    if (!p || used.has(p.id)) continue;
    ordered.push(p);
    used.add(p.id);
  }
  const rest = items.filter((p) => !used.has(p.id));
  rest.sort(dateSort);
  return [...ordered, ...rest];
}

function orderForTab(tabKey, projectOrders, customizedTabs) {
  if (tabKey === SEEDED_CUSTOM_ORDER_TAB) return projectOrders?.[tabKey];
  if (Array.isArray(customizedTabs) && customizedTabs.includes(tabKey)) {
    return projectOrders?.[tabKey];
  }
  return null;
}

function projectsForPlanningTab(allProjects, tab, projectOrders, customizedTabs) {
  const list = collapseLinkedProjectsForPlanning(
    (allProjects || []).filter((p) => projectTabKey(p) === tab)
  );
  return applyProjectOrder(list, orderForTab(tab, projectOrders, customizedTabs));
}

async function fetchSharedLayout() {
  const res = await fetch(`${API_URL}/api/planning-manager-layout`, {
    headers: getApiHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to load sheet layout (${res.status})`);
  const data = await res.json().catch(() => ({}));
  return normalizeLayoutPayload(data.layout);
}

async function persistSharedLayout(
  colWidths,
  rowHeights,
  rowsCustomized,
  { projectOrders, activeTab, customizedTabs } = {}
) {
  const layout = {
    colWidths,
    rowsCustomized: Boolean(rowsCustomized),
    rowHeights: rowsCustomized ? rowHeights : undefined,
  };
  if (projectOrders !== undefined) {
    layout.projectOrders = projectOrders;
    if (projectOrders?.[SEEDED_CUSTOM_ORDER_TAB]) {
      layout.projectOrder = projectOrders[SEEDED_CUSTOM_ORDER_TAB];
    }
  }
  if (activeTab !== undefined) {
    layout.activeTab = activeTab;
  }
  if (customizedTabs !== undefined) {
    layout.customizedTabs = customizedTabs;
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
  const navigate = useNavigate();
  const { hasDrawing } = useDrawingAccess();
  const [allProjects, setAllProjects] = useState([]);
  const [activeTab, setActiveTab] = useState("VIC 2025");
  const [projectOrders, setProjectOrders] = useState({});
  const [customizedTabs, setCustomizedTabs] = useState([]);
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
  const [tpMenu, setTpMenu] = useState(null); // { projectId, colIndex, field, kind, options, top, left, width }
  const [cellEdit, setCellEdit] = useState(null); // { projectId, colIndex, field, saveAs, draft }
  // TEMP: right-click calendar to set historical dates — remove later
  const [manualDatePicker, setManualDatePicker] = useState(null);
  // manualDatePicker: { projectId, colIndex, field, saveAs, draft, top, left }
  const cellEditInputRef = useRef(null);
  const manualDateInputRef = useRef(null);
  const cellEditRef = useRef(null);
  const emptyClickEditTimerRef = useRef(null);
  cellEditRef.current = cellEdit;
  const projectOrdersRef = useRef({});
  const customizedTabsRef = useRef([]);
  const activeTabRef = useRef(activeTab);
  const moveRowInputRef = useRef(null);
  activeTabRef.current = activeTab;
  projectOrdersRef.current = projectOrders;
  customizedTabsRef.current = customizedTabs;

  const sheetTabs = useMemo(() => buildSheetTabs(allProjects), [allProjects]);

  const projects = useMemo(() => {
    return projectsForPlanningTab(allProjects, activeTab, projectOrders, customizedTabs);
  }, [allProjects, activeTab, projectOrders, customizedTabs]);
  const projectsRef = useRef(projects);
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
      persistSharedLayout(nextCols, nextRows, rowsCustomized, {
        projectOrders: projectOrdersRef.current ?? {},
        activeTab: activeTabRef.current ?? undefined,
        customizedTabs: customizedTabsRef.current ?? [],
      }).catch((err) => {
        console.error("Failed to save planning manager layout:", err);
      });
    }, 250);
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
    if (!tpMenu) return undefined;
    function onDocPointerDown(e) {
      const t = e.target;
      if (t?.closest?.("[data-pm-menu]") || t?.closest?.("[data-pm-arrow]")) return;
      setTpMenu(null);
    }
    function onKey(e) {
      if (e.key === "Escape") setTpMenu(null);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [tpMenu]);

  useEffect(() => {
    if (!cellEdit) return undefined;
    const t = window.setTimeout(() => {
      cellEditInputRef.current?.focus?.();
      cellEditInputRef.current?.select?.();
    }, 0);
    return () => window.clearTimeout(t);
  }, [cellEdit?.projectId, cellEdit?.colIndex]);

  useEffect(() => {
    return () => {
      if (emptyClickEditTimerRef.current) {
        window.clearTimeout(emptyClickEditTimerRef.current);
        emptyClickEditTimerRef.current = null;
      }
    };
  }, []);

  // TEMP: right-click date picker — remove later
  useEffect(() => {
    if (!manualDatePicker) return undefined;
    const t = window.setTimeout(() => {
      manualDateInputRef.current?.focus?.();
      try {
        manualDateInputRef.current?.showPicker?.();
      } catch {
        /* showPicker may throw if not triggered by user gesture in some browsers */
      }
    }, 0);
    function onDocPointerDown(e) {
      const el = e.target;
      if (el?.closest?.("[data-manual-date-picker]")) return;
      setManualDatePicker(null);
    }
    function onKey(e) {
      if (e.key === "Escape") setManualDatePicker(null);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("pointerdown", onDocPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [manualDatePicker?.projectId, manualDatePicker?.colIndex]);

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
          if ((p?.classification || "").trim() === "Home Office / Studio") return false;
          return projectTabKey(p) != null;
        });
        const orders = { ...(layout?.projectOrders || {}) };
        const customized = layout?.customizedTabs || [];
        const tabs = buildSheetTabs(list);
        let nextTab = layout?.activeTab && tabs.includes(layout.activeTab) ? layout.activeTab : null;
        if (!nextTab) {
          if (tabs.includes(SEEDED_CUSTOM_ORDER_TAB)) nextTab = SEEDED_CUSTOM_ORDER_TAB;
          else nextTab = tabs[0] || SEEDED_CUSTOM_ORDER_TAB;
        }
        setAllProjects(list);
        setProjectOrders(orders);
        projectOrdersRef.current = orders;
        setCustomizedTabs(customized);
        customizedTabsRef.current = customized;
        setActiveTab(nextTab);
        activeTabRef.current = nextTab;
        setSheetCells(cells && typeof cells === "object" ? cells : {});
        if (layout?.colWidths) setColWidths(layout.colWidths);
        if (layout?.rowsCustomized && layout.rowHeights) {
          userResizedRowsRef.current = true;
          setRowHeights(layout.rowHeights);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load projects");
          setAllProjects([]);
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
        const raw = project?.[mapping.field];
        if (raw == null || String(raw).trim() === "") return "";
        // Dates show as dd-Mmm; free-text / N/A / select labels show as stored.
        return formatPlanningManagerSheetDate(raw) || String(raw).trim();
      }
      const stored = sheetCells?.[String(project.id)]?.[String(colIndex)];
      return stored != null ? String(stored) : "";
    },
    [projects, sheetCells]
  );

  // Copy / paste + arrow-key navigation (skipped while inline-editing).
  useEffect(() => {
    function ensureCellVisible(row, col) {
      const el = sheetViewportRef.current;
      if (!el) return;
      const cellLeft = colOffsets[col] ?? 0;
      const cellRight = colOffsets[col + 1] ?? cellLeft;
      const cellTop = rowOffsets[row] ?? 0;
      const cellBottom = rowOffsets[row + 1] ?? cellTop;
      const viewLeft = el.scrollLeft;
      const viewTop = el.scrollTop;
      const bodyW = Math.max(0, el.clientWidth - ROW_HEADER_WIDTH);
      const bodyH = Math.max(0, el.clientHeight - COL_HEADER_HEIGHT);
      let nextLeft = viewLeft;
      let nextTop = viewTop;
      // Col A is sticky — only scroll horizontally for other columns.
      if (col > 0) {
        if (cellLeft < viewLeft) nextLeft = cellLeft;
        else if (cellRight > viewLeft + bodyW) nextLeft = Math.max(0, cellRight - bodyW);
      }
      if (cellTop < viewTop) nextTop = cellTop;
      else if (cellBottom > viewTop + bodyH) nextTop = Math.max(0, cellBottom - bodyH);
      if (nextLeft !== viewLeft || nextTop !== viewTop) {
        el.scrollLeft = nextLeft;
        el.scrollTop = nextTop;
      }
    }

    function onKey(e) {
      if (cellEditRef.current) return;
      if (!selectedCell) return;

      // Don't steal keys from other focused inputs.
      const active = document.activeElement;
      const tag = active?.tagName?.toLowerCase?.() || "";
      if (tag === "input" || tag === "textarea" || active?.isContentEditable) return;

      const { row, col } = selectedCell;
      const arrowKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
      if (arrowKeys.includes(e.key)) {
        if (row < 0 || col < 0) return;
        e.preventDefault();
        let nextRow = row;
        let nextCol = col;
        if (e.key === "ArrowUp") nextRow = Math.max(DATA_START_ROW, row - 1);
        if (e.key === "ArrowDown") nextRow = Math.min(ROW_COUNT - 1, row + 1);
        if (e.key === "ArrowLeft") nextCol = Math.max(0, col - 1);
        if (e.key === "ArrowRight") nextCol = Math.min(COL_COUNT - 1, col + 1);
        if (nextRow === row && nextCol === col) return;
        if (emptyClickEditTimerRef.current) {
          window.clearTimeout(emptyClickEditTimerRef.current);
          emptyClickEditTimerRef.current = null;
        }
        setTpMenu(null);
        setDraftspersonMenu(null);
        setManualDatePicker(null);
        setSelectedCell({ row: nextRow, col: nextCol });
        ensureCellVisible(nextRow, nextCol);
        return;
      }

      if (row < DATA_START_ROW || col < 0) return;
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;
      const key = String(e.key || "").toLowerCase();
      if (key !== "c" && key !== "v") return;

      if (key === "c") {
        const text = cellValue(row, col) || "";
        e.preventDefault();
        void navigator.clipboard.writeText(text).catch((err) => {
          console.error("Copy failed:", err);
        });
        return;
      }

      if (key === "v") {
        const projectIndex = row - DATA_START_ROW;
        if (projectIndex < 0 || projectIndex >= projects.length) return;
        const project = projects[projectIndex];
        const mapping = getPlanningManagerColMapping(col);
        if (!project?.id || !planningManagerCellAllowsFreeEdit(col, mapping)) return;
        e.preventDefault();
        void navigator.clipboard
          .readText()
          .then((text) => writeCellClipboardText(project, col, mapping, text))
          .catch((err) => {
            console.error("Paste failed:", err);
            alert("Could not read clipboard");
          });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedCell, cellValue, projects, colOffsets, rowOffsets]);

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
    setTpMenu(null);
    setCellEdit(null);
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

    setAllProjects((prev) =>
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
      setAllProjects((prev) =>
        prev.map((p) => (p.id === project.id ? { ...p, draftsperson: previous } : p))
      );
      alert("Failed to update draftsperson");
    }
  }

  function reorderProject(fromIndex, toIndex, tabKey = activeTabRef.current) {
    const tab = tabKey || activeTabRef.current;
    const list =
      tab === activeTabRef.current
        ? projectsRef.current
        : projectsForPlanningTab(
            allProjects,
            tab,
            projectOrdersRef.current,
            customizedTabsRef.current
          );
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
    const order = next.map((p) => Number(p.id));
    setProjectOrders((prev) => {
      const merged = { ...prev, [tab]: order };
      projectOrdersRef.current = merged;
      return merged;
    });
    if (tab !== SEEDED_CUSTOM_ORDER_TAB) {
      setCustomizedTabs((prev) => {
        if (prev.includes(tab)) return prev;
        const merged = [...prev, tab];
        customizedTabsRef.current = merged;
        return merged;
      });
    }
    queueSaveLayout(
      colWidthsRef.current,
      rowHeightsRef.current,
      userResizedRowsRef.current
    );
  }

  function selectSheetTab(tabKey) {
    if (!tabKey || tabKey === activeTabRef.current) return;
    setActiveTab(tabKey);
    activeTabRef.current = tabKey;
    setSelectedCell(null);
    setDraftspersonMenu(null);
    setProjectSearch("");
    queueSaveLayout(
      colWidthsRef.current,
      rowHeightsRef.current,
      userResizedRowsRef.current
    );
  }

  function openMoveRowModal(projectIndex, tabKey = activeTabRef.current) {
    const tab = tabKey || activeTabRef.current;
    if (tab !== activeTabRef.current) {
      setActiveTab(tab);
      activeTabRef.current = tab;
    }
    const list = projectsForPlanningTab(
      allProjects,
      tab,
      projectOrdersRef.current,
      customizedTabsRef.current
    );
    if (projectIndex < 0 || projectIndex >= list.length) return;
    const project = list[projectIndex];
    const sheetRow = DATA_START_ROW + projectIndex + 1;
    selectCell(DATA_START_ROW + projectIndex, 0);
    setMoveRowModal({
      projectIndex,
      label: projectLabel(project) || "Project",
      inputValue: String(sheetRow),
      tabKey: tab,
    });
  }

  const projectSearchMatches = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return [];
    const tab = activeTab;
    const list = projectsForPlanningTab(allProjects, tab, projectOrders, customizedTabs);
    const out = [];
    for (let i = 0; i < list.length; i += 1) {
      const label = projectLabel(list[i]);
      if (!label || !label.toLowerCase().includes(q)) continue;
      out.push({
        tabKey: tab,
        projectIndex: i,
        label,
        sheetRow: DATA_START_ROW + i + 1,
        cancelled: projectShowsRed(list[i]),
      });
      if (out.length >= 12) return out;
    }
    return out;
  }, [projectSearch, allProjects, projectOrders, customizedTabs, activeTab]);

  function confirmMoveRowModal() {
    if (!moveRowModal) return;
    const rowNum = parseInt(String(moveRowModal.inputValue).trim(), 10);
    if (!Number.isFinite(rowNum)) {
      alert("Enter a valid row number");
      return;
    }
    const tab = moveRowModal.tabKey || activeTabRef.current;
    if (tab && tab !== activeTabRef.current) {
      setActiveTab(tab);
      activeTabRef.current = tab;
    }
    const list = projectsForPlanningTab(
      allProjects,
      tab,
      projectOrdersRef.current,
      customizedTabsRef.current
    );
    if (list.length <= 0) {
      setMoveRowModal(null);
      return;
    }
    const firstProjectRow = DATA_START_ROW + 1;
    const targetIndex = Math.max(0, Math.min(list.length - 1, rowNum - firstProjectRow));
    reorderProject(moveRowModal.projectIndex, targetIndex, tab);
    setMoveRowModal(null);
  }

  function openPlanningManagerCellMenu(project, colIndex, mapping, anchorEl) {
    if (!project?.id || !mapping?.field || !anchorEl) return;
    if (!isPlanningManagerDropdownCol(mapping)) return;
    const options = getPlanningManagerDropdownOptions(mapping);
    if (!options.length) return;
    const rect = anchorEl.getBoundingClientRect();
    const menuWidth = Math.max(
      120,
      Math.min(200, Math.max(colWidths[colIndex] || DEFAULT_COL_WIDTH, 140))
    );
    let left = rect.right - menuWidth;
    if (left < 8) left = 8;
    if (left + menuWidth > window.innerWidth - 8) left = Math.max(8, window.innerWidth - menuWidth - 8);
    let top = rect.bottom + 2;
    const estimatedH = 36 + options.length * 32;
    if (top + estimatedH > window.innerHeight - 8) {
      top = Math.max(8, rect.top - estimatedH - 2);
    }
    setDraftspersonMenu(null);
    setCellEdit(null);
    setTpMenu({
      projectId: project.id,
      colIndex,
      field: mapping.field,
      kind: mapping.kind,
      options,
      top,
      left,
      width: menuWidth,
    });
    const projectIndex = projects.findIndex((p) => p.id === project.id);
    if (projectIndex >= 0) {
      setSelectedCell({ row: DATA_START_ROW + projectIndex, col: colIndex });
    }
  }

  async function savePlanningManagerSelectValue(projectId, field, nextValue) {
    if (!projectId || !field) return;
    const previous = projects.find((p) => p.id === projectId)?.[field] ?? null;
    const value = nextValue != null && String(nextValue).trim() !== "" ? String(nextValue).trim() : null;

    setAllProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, [field]: value } : p))
    );

    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/planning-manager-select`, {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify({ field, value }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to save (${res.status})`);
      }
      const data = await res.json().catch(() => ({}));
      if (data && Object.prototype.hasOwnProperty.call(data, "value")) {
        setAllProjects((prev) =>
          prev.map((p) => (p.id === projectId ? { ...p, [field]: data.value } : p))
        );
      }
    } catch (err) {
      console.error("Error saving planning manager cell:", err);
      setAllProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, [field]: previous } : p))
      );
      alert(err.message || "Failed to save");
    }
  }

  function beginCellEdit(project, colIndex, mapping, initialDraft) {
    if (!project?.id || !planningManagerCellAllowsFreeEdit(colIndex, mapping)) return;
    const saveAs = mapping?.field ? "select" : "blob";
    setTpMenu(null);
    setManualDatePicker(null);
    setCellEdit({
      projectId: project.id,
      colIndex,
      field: mapping?.field || null,
      saveAs,
      draft: initialDraft != null ? String(initialDraft) : "",
    });
  }

  function cancelCellEdit() {
    setCellEdit(null);
  }

  async function commitCellEdit() {
    const edit = cellEditRef.current;
    if (!edit) return;
    const { projectId, colIndex, field, saveAs, draft } = edit;
    setCellEdit(null);
    const trimmed = draft != null ? String(draft).trim() : "";
    if (saveAs === "select" && field) {
      void savePlanningManagerSelectValue(projectId, field, trimmed || null);
      return;
    }
    // Legacy blob cell
    const projectKey = String(projectId);
    const colKey = String(colIndex);
    const previous = sheetCells?.[projectKey]?.[colKey];
    const nextValue = trimmed || "";
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
    try {
      const saved = await persistCellValue(projectId, colIndex, nextValue || null);
      if (saved) setSheetCells(saved);
    } catch (err) {
      console.error("Error saving typed sheet cell:", err);
      setSheetCells((prev) => {
        const next = { ...prev, [projectKey]: { ...(prev[projectKey] || {}) } };
        if (previous == null || previous === "") delete next[projectKey][colKey];
        else next[projectKey][colKey] = previous;
        if (!Object.keys(next[projectKey] || {}).length) delete next[projectKey];
        return next;
      });
      alert(err.message || "Failed to save");
    }
  }

  async function writeCellClipboardText(project, colIndex, mapping, text) {
    if (!project?.id || !planningManagerCellAllowsFreeEdit(colIndex, mapping)) return;
    const trimmed = text != null ? String(text).trim() : "";
    if (mapping?.field) {
      void savePlanningManagerSelectValue(project.id, mapping.field, trimmed || null);
      return;
    }
    const projectKey = String(project.id);
    const colKey = String(colIndex);
    const previous = sheetCells?.[projectKey]?.[colKey];
    setSheetCells((prev) => {
      const next = { ...prev, [projectKey]: { ...(prev[projectKey] || {}) } };
      if (!trimmed) {
        delete next[projectKey][colKey];
        if (!Object.keys(next[projectKey]).length) delete next[projectKey];
      } else {
        next[projectKey][colKey] = trimmed;
      }
      return next;
    });
    try {
      const saved = await persistCellValue(project.id, colIndex, trimmed || null);
      if (saved) setSheetCells(saved);
    } catch (err) {
      console.error("Error pasting sheet cell:", err);
      setSheetCells((prev) => {
        const next = { ...prev, [projectKey]: { ...(prev[projectKey] || {}) } };
        if (previous == null || previous === "") delete next[projectKey][colKey];
        else next[projectKey][colKey] = previous;
        if (!Object.keys(next[projectKey] || {}).length) delete next[projectKey];
        return next;
      });
      alert(err.message || "Failed to paste");
    }
  }

  function beginTownPlanningNoteEdit(projectId, colIndex, field) {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const mapping = getPlanningManagerColMapping(colIndex);
    const current = project?.[field] != null ? String(project[field]).trim() : "";
    const draft = formatPlanningManagerSheetDate(current) || current;
    beginCellEdit(project, colIndex, mapping || { field }, draft);
  }

  async function handlePlanningManagerMenuPick(pickedValue) {
    if (!tpMenu) return;
    const { projectId, colIndex, field } = tpMenu;
    setTpMenu(null);
    if (pickedValue === "__date__") {
      void savePlanningManagerSelectValue(projectId, field, planningManagerTodayIsoDate());
      return;
    }
    if (pickedValue === "__clear__") {
      void savePlanningManagerSelectValue(projectId, field, null);
      return;
    }
    if (pickedValue === "__note__") {
      beginTownPlanningNoteEdit(projectId, colIndex, field);
      return;
    }
    void savePlanningManagerSelectValue(projectId, field, pickedValue);
  }

  async function stampDateOnCell(rowIndex, colIndex) {
    if (emptyClickEditTimerRef.current) {
      window.clearTimeout(emptyClickEditTimerRef.current);
      emptyClickEditTimerRef.current = null;
    }
    setCellEdit(null);
    if (rowIndex < DATA_START_ROW || colIndex < 2) return;
    const projectIndex = rowIndex - DATA_START_ROW;
    if (projectIndex < 0 || projectIndex >= projects.length) return;
    const project = projects[projectIndex];
    if (!project?.id) return;

    const mapping = getPlanningManagerColMapping(colIndex);
    if (mapping?.readOnly) return;
    // Dropdown cells use the arrow menu — no double-click stamp.
    if (isPlanningManagerDropdownCol(mapping)) return;

    // Mapped project fields (C–R): store on the project so other pages can read them.
    if (mapping?.field) {
      const field = mapping.field;
      const previous = project[field] ?? null;
      const hasDate = previous != null && String(previous).trim() !== "";
      const nextValue = hasDate ? null : planningManagerTodayIsoDate();

      setAllProjects((prev) =>
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
          setAllProjects((prev) =>
            prev.map((p) => (p.id === project.id ? { ...p, [field]: data.value } : p))
          );
        }
      } catch (err) {
        console.error("Error saving planning manager date:", err);
        setAllProjects((prev) =>
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

  /** TEMP: right-click calendar for historical date correction — remove later */
  function openManualDatePicker(project, rowIndex, colIndex, clientX, clientY) {
    if (!project?.id || colIndex < 2 || rowIndex < DATA_START_ROW) return;
    const mapping = getPlanningManagerColMapping(colIndex);
    if (!planningManagerCellAllowsManualDate(mapping)) return;

    let currentRaw = "";
    if (mapping?.field) {
      currentRaw = project[mapping.field] != null ? String(project[mapping.field]).trim() : "";
    } else {
      currentRaw =
        sheetCells?.[String(project.id)]?.[String(colIndex)] != null
          ? String(sheetCells[String(project.id)][String(colIndex)]).trim()
          : "";
    }
    let draft = planningManagerTodayIsoDate();
    if (/^\d{4}-\d{2}-\d{2}/.test(currentRaw)) {
      draft = currentRaw.slice(0, 10);
    }

    let saveAs = "blob";
    if (mapping?.kind === "note" || mapping?.kind === "naDate") saveAs = "select";
    else if (mapping?.field) saveAs = "date";

    const pickerW = 220;
    const pickerH = 120;
    let left = clientX;
    let top = clientY;
    if (left + pickerW > window.innerWidth - 8) left = Math.max(8, window.innerWidth - pickerW - 8);
    if (top + pickerH > window.innerHeight - 8) top = Math.max(8, window.innerHeight - pickerH - 8);

    setDraftspersonMenu(null);
    setTpMenu(null);
    setCellEdit(null);
    setSelectedCell({ row: rowIndex, col: colIndex });
    setManualDatePicker({
      projectId: project.id,
      colIndex,
      field: mapping?.field || null,
      saveAs,
      draft,
      top,
      left,
    });
  }

  async function applyManualDatePicker() {
    if (!manualDatePicker) return;
    const { projectId, colIndex, field, saveAs, draft } = manualDatePicker;
    const iso = draft != null ? String(draft).trim().slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      alert("Pick a valid date");
      return;
    }
    setManualDatePicker(null);

    if (saveAs === "select" && field) {
      void savePlanningManagerSelectValue(projectId, field, iso);
      return;
    }

    if (saveAs === "date" && field) {
      const previous = projects.find((p) => p.id === projectId)?.[field] ?? null;
      setAllProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, [field]: iso } : p))
      );
      try {
        const res = await fetch(`${API_URL}/api/projects/${projectId}/planning-manager-date`, {
          method: "PUT",
          headers: getApiHeaders(),
          body: JSON.stringify({ field, value: iso }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Failed to save (${res.status})`);
        }
        const data = await res.json().catch(() => ({}));
        if (data && Object.prototype.hasOwnProperty.call(data, "value")) {
          setAllProjects((prev) =>
            prev.map((p) => (p.id === projectId ? { ...p, [field]: data.value } : p))
          );
        }
      } catch (err) {
        console.error("Error saving manual planning date:", err);
        setAllProjects((prev) =>
          prev.map((p) => (p.id === projectId ? { ...p, [field]: previous } : p))
        );
        alert(err.message || "Failed to save date");
      }
      return;
    }

    // Legacy blob cell
    const projectKey = String(projectId);
    const colKey = String(colIndex);
    const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
    const display = formatSheetDate(new Date(y, m - 1, d));
    const previous = sheetCells?.[projectKey]?.[colKey];
    setSheetCells((prev) => {
      const next = { ...prev, [projectKey]: { ...(prev[projectKey] || {}) } };
      next[projectKey][colKey] = display;
      return next;
    });
    try {
      const saved = await persistCellValue(projectId, colIndex, display);
      if (saved) setSheetCells(saved);
    } catch (err) {
      console.error("Error saving manual sheet date:", err);
      setSheetCells((prev) => {
        const next = { ...prev, [projectKey]: { ...(prev[projectKey] || {}) } };
        if (previous == null || previous === "") delete next[projectKey][colKey];
        else next[projectKey][colKey] = previous;
        if (!Object.keys(next[projectKey] || {}).length) delete next[projectKey];
        return next;
      });
      alert(err.message || "Failed to save date");
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
            maxWidth: "calc(100% - 280px)",
            flexShrink: 1,
            minWidth: 0,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: "2.4rem",
              fontWeight: 700,
              color: PAGE_TEXT,
              letterSpacing: "1px",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            Managers
          </h1>
          <div
            style={{
              position: "relative",
              zIndex: 40,
              flexShrink: 0,
              height: 36,
            }}
          >
            <input
              type="search"
              value={projectSearch}
              placeholder="Search project…"
              onChange={(e) => setProjectSearch(e.target.value)}
              style={{
                width: 220,
                height: 36,
                padding: "0 12px",
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
                  position: "absolute",
                  left: "100%",
                  top: 0,
                  marginLeft: 8,
                  width: 320,
                  maxHeight: 320,
                  overflowY: "auto",
                  background: WHITE,
                  border: `1px solid ${HEADER_GRID_LINE}`,
                  borderRadius: 6,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
                  zIndex: 50,
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
                      key={`${match.tabKey}-${match.projectIndex}`}
                      type="button"
                      title={match.label}
                      onClick={() => {
                        openMoveRowModal(match.projectIndex, match.tabKey);
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
                        {match.tabKey} · R{match.sheetRow}
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
          {hasDrawing ? (
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
                      const showRed = projectShowsRed(project);
                      return (
                    <div
                      title={addressText || undefined}
                      onClick={(e) => selectCell(rowIndex, 0, e)}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!project?.access_token) return;
                        navigate(projectPath(project, { view: "overview" }));
                      }}
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
                        color: showRed ? CANCELLED_TEXT : ADDRESS_TEXT,
                        WebkitTextFillColor: showRed ? CANCELLED_TEXT : ADDRESS_TEXT,
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
                        projectIndex >= 0 && projectIndex < projects.length
                          ? projects[projectIndex]
                          : null;
                      const mapping = getPlanningManagerColMapping(colIndex);
                      const isDraftCol = colIndex === 1 && project;
                      const isPmDropdownCol = isPlanningManagerDropdownCol(mapping) && project;
                      const canFreeEdit =
                        Boolean(project) && planningManagerCellAllowsFreeEdit(colIndex, mapping);
                      const isEditingCell =
                        Boolean(
                          cellEdit &&
                            project &&
                            cellEdit.projectId === project.id &&
                            cellEdit.colIndex === colIndex
                        );
                      const showRed = projectShowsRed(project);
                      const cellTextColor = showRed ? CANCELLED_TEXT : ADDRESS_TEXT;
                      return (
                        <div
                          key={colIndex}
                          title={isEditingCell ? undefined : value || undefined}
                          onClick={(e) => {
                            selectCell(rowIndex, colIndex, e);
                            if (emptyClickEditTimerRef.current) {
                              window.clearTimeout(emptyClickEditTimerRef.current);
                              emptyClickEditTimerRef.current = null;
                            }
                            if (
                              canFreeEdit &&
                              !isEditingCell &&
                              !(value || "").trim()
                            ) {
                              // Delay so double-click date stamp can cancel this.
                              emptyClickEditTimerRef.current = window.setTimeout(() => {
                                emptyClickEditTimerRef.current = null;
                                beginCellEdit(project, colIndex, mapping, "");
                              }, 250);
                            }
                          }}
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (emptyClickEditTimerRef.current) {
                              window.clearTimeout(emptyClickEditTimerRef.current);
                              emptyClickEditTimerRef.current = null;
                            }
                            if (colIndex >= 2) stampDateOnCell(rowIndex, colIndex);
                          }}
                          onContextMenu={(e) => {
                            if (
                              !project ||
                              colIndex < 2 ||
                              !planningManagerCellAllowsManualDate(mapping)
                            ) {
                              return;
                            }
                            e.preventDefault();
                            e.stopPropagation();
                            openManualDatePicker(project, rowIndex, colIndex, e.clientX, e.clientY);
                          }}
                          style={{
                            position: "relative",
                            zIndex: selected || isEditingCell ? 2 : 0,
                            width: colWidths[colIndex],
                            minWidth: colWidths[colIndex],
                            height: h,
                            borderRight: `1px solid ${GRID_LINE}`,
                            borderBottom: `1px solid ${GRID_LINE}`,
                            boxSizing: "border-box",
                            padding: isDraftCol
                              ? "0 14px 2px 14px"
                              : isPmDropdownCol
                                ? "0 14px 2px 6px"
                                : "0 6px 2px",
                            display: "flex",
                            alignItems: "flex-end",
                            justifyContent: "center",
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                            textOverflow: "ellipsis",
                            color: cellTextColor,
                            fontWeight: colIndex === 1 ? 700 : 400,
                            fontSize: "15px",
                            fontFamily: SHEET_FONT,
                            background: fill || WHITE,
                            boxShadow: selected ? SELECTION_OUTLINE : undefined,
                            flexShrink: 0,
                            cursor: "cell",
                          }}
                        >
                          {isEditingCell ? (
                            <input
                              ref={cellEditInputRef}
                              type="text"
                              value={cellEdit.draft}
                              onChange={(e) =>
                                setCellEdit((prev) =>
                                  prev ? { ...prev, draft: e.target.value } : prev
                                )
                              }
                              onClick={(e) => e.stopPropagation()}
                              onDoubleClick={(e) => e.stopPropagation()}
                              onBlur={() => void commitCellEdit()}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void commitCellEdit();
                                } else if (e.key === "Escape") {
                                  e.preventDefault();
                                  cancelCellEdit();
                                }
                              }}
                              style={{
                                width: "100%",
                                minWidth: 0,
                                flex: 1,
                                border: "none",
                                outline: "none",
                                padding: 0,
                                margin: 0,
                                background: "transparent",
                                color: cellTextColor,
                                fontSize: "15px",
                                fontFamily: SHEET_FONT,
                                boxSizing: "border-box",
                                textAlign: "center",
                              }}
                            />
                          ) : (
                            <span
                              style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                minWidth: 0,
                                flex: 1,
                                textAlign: "center",
                              }}
                            >
                              {value}
                            </span>
                          )}
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
                          {isPmDropdownCol && !isEditingCell ? (
                            <button
                              type="button"
                              data-pm-arrow
                              title="Select"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                selectCell(rowIndex, colIndex);
                                openPlanningManagerCellMenu(
                                  project,
                                  colIndex,
                                  mapping,
                                  e.currentTarget
                                );
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

          {sheetReady ? (
            <div
              style={{
                flexShrink: 0,
                display: "flex",
                alignItems: "flex-end",
                gap: 2,
                padding: "0 8px",
                background: HEADER_BG,
                borderTop: `1px solid ${HEADER_GRID_LINE}`,
                minHeight: 28,
                overflowX: "auto",
                overflowY: "hidden",
              }}
            >
              {sheetTabs.length === 0 ? (
                <div
                  style={{
                    padding: "4px 12px",
                    fontSize: 12,
                    color: UI.textMuted,
                    fontFamily: SHEET_FONT,
                  }}
                >
                  No state/year tabs
                </div>
              ) : (
                sheetTabs.map((tab) => {
                  const selected = tab === activeTab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => selectSheetTab(tab)}
                      style={{
                        flexShrink: 0,
                        border: `1px solid ${HEADER_GRID_LINE}`,
                        borderBottom: selected ? `1px solid ${WHITE}` : `1px solid ${HEADER_GRID_LINE}`,
                        marginBottom: selected ? -1 : 0,
                        borderTopLeftRadius: 4,
                        borderTopRightRadius: 4,
                        padding: "4px 14px",
                        background: selected ? WHITE : "#e8e8e8",
                        color: selected ? ADDRESS_TEXT : HEADER_TEXT,
                        fontSize: 12,
                        fontWeight: selected ? 700 : 500,
                        fontFamily: SHEET_FONT,
                        cursor: "pointer",
                        position: "relative",
                        zIndex: selected ? 2 : 1,
                      }}
                    >
                      {tab}
                    </button>
                  );
                })
              )}
            </div>
          ) : null}
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

      {tpMenu ? (
        <div
          data-pm-menu
          style={{
            position: "fixed",
            top: tpMenu.top,
            left: tpMenu.left,
            width: tpMenu.width,
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
            const project = projects.find((p) => p.id === tpMenu.projectId);
            const currentRaw =
              project?.[tpMenu.field] != null ? String(project[tpMenu.field]).trim() : "";
            const currentDisplay =
              formatPlanningManagerSheetDate(currentRaw) || currentRaw;
            return (tpMenu.options || []).map((opt, idx, arr) => {
              const active =
                opt.value === "__date__"
                  ? Boolean(currentRaw && /^\d{4}-\d{2}-\d{2}/.test(currentRaw))
                  : opt.value === "__clear__" || opt.value === "__note__"
                    ? false
                    : currentRaw === opt.value || currentDisplay === opt.label;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void handlePlanningManagerMenuPick(opt.value);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 10px",
                    border: "none",
                    borderBottom:
                      idx < arr.length - 1 ? `1px solid ${HEADER_GRID_LINE}` : "none",
                    background: active ? COL_YELLOW : WHITE,
                    color: ADDRESS_TEXT,
                    fontSize: "13px",
                    fontWeight: active ? 700 : 500,
                    cursor: "pointer",
                    fontFamily: SHEET_FONT,
                  }}
                >
                  {opt.label}
                </button>
              );
            });
          })()}
        </div>
      ) : null}

      {/* TEMP: right-click calendar for historical dates — remove later */}
      {manualDatePicker ? (
        <div
          data-manual-date-picker
          style={{
            position: "fixed",
            top: manualDatePicker.top,
            left: manualDatePicker.left,
            zIndex: 10070,
            background: WHITE,
            border: `1px solid ${HEADER_GRID_LINE}`,
            boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
            borderRadius: 6,
            padding: "12px 14px",
            fontFamily: SHEET_FONT,
            minWidth: 200,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: HEADER_TEXT,
              marginBottom: 8,
            }}
          >
            Set date
          </div>
          <input
            ref={manualDateInputRef}
            type="date"
            value={manualDatePicker.draft}
            onChange={(e) =>
              setManualDatePicker((prev) =>
                prev ? { ...prev, draft: e.target.value } : prev
              )
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void applyManualDatePicker();
              }
            }}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "6px 8px",
              fontSize: 14,
              fontFamily: SHEET_FONT,
              border: `1px solid ${HEADER_GRID_LINE}`,
              borderRadius: 4,
              marginBottom: 10,
              color: ADDRESS_TEXT,
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              type="button"
              onClick={() => setManualDatePicker(null)}
              style={{
                padding: "6px 12px",
                border: `1px solid ${HEADER_GRID_LINE}`,
                borderRadius: 4,
                background: WHITE,
                color: ADDRESS_TEXT,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: SHEET_FONT,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void applyManualDatePicker()}
              style={{
                padding: "6px 12px",
                border: "none",
                borderRadius: 4,
                background: HEADING_BLUE,
                color: WHITE,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: SHEET_FONT,
              }}
            >
              Set
            </button>
          </div>
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
