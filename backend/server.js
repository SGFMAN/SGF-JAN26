// C:\SGF\backend\server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const path = require("path");
const { pathToFileURL, fileURLToPath } = require("node:url");
const fsSync = require("fs");
const fs = require("fs").promises;
const XLSX = require("xlsx");
const multer = require("multer");
const nodemailer = require("nodemailer");
const OpenAI = require("openai");
const { toFile } = require("openai/uploads");
const PDFDocument = require("pdfkit");
const { PDFDocument: PdfLibDocument } = require("pdf-lib");
const sharp = require("sharp");
const crypto = require("crypto");
const {
  normalizeParcelState,
  parseParcelLatLng,
  lookupParcelBoundary,
  formatPropertyBoundaryResponse,
} = require("./mapsParcelLookup");
const {
  normalizePlanningState,
  parsePlanningLatLng,
  parseEnvelope,
  lookupPlanningInfo,
  formatPlanningInfoResponse,
} = require("./mapsPlanningLookup");
const {
  normalizeEasementsState,
  parseEasementsLatLng,
  parseEnvelope: parseEasementsEnvelope,
  parseBoundaryGeometry,
  normalizeBoundaryInput,
  lookupPropertyEasements,
  formatPropertyEasementsResponse,
} = require("./mapsEasementsLookup");
const {
  lookupAhdElevations,
  lookupMonumentBox,
  normalizeElevationState,
  parsePointsInput,
} = require("./mapsElevationLookup");
const {
  parseFloorPlanFields,
  ensureMapFloorPlansDollarValueColumn,
  listFloorPlans,
  getFloorPlan,
  createFloorPlan,
  updateFloorPlan,
  updateFloorPlanDollarValue,
  updateFloorPlanDefine3D,
  deleteFloorPlan,
  getFloorPlanImagePath,
} = require("./mapFloorPlans");
const { ensureMapQuoteItemsTable, listQuoteItems, saveQuoteItems } = require("./mapQuoteItems");
const {
  ACCESS_AREAS,
  ACCESS_AREA_KEYS,
  ensureUserAccessPermissionsTable,
  buildAccessPermissionsMatrix,
  userHasAccessGrant,
} = require("./userAccessPermissions");
const {
  touchUserPresence,
  clearUserPresence,
  getOnlineUserIds,
} = require("./userPresence");
const { ensureUserMessagesTable } = require("./userMessages");
const { generateMapsProposalPdf, OUTPUT_FILENAME, PROPOSAL_DIR } = require("./mapsProposalPdf");
const {
  ensureProjectAccessTokens,
  isLegacyNumericProjectId,
  resolveProjectIdFromAccessToken,
  getProjectAccessTokenById,
} = require("./projectAccessToken");
const {
  SCHEMA_VERSION,
  ensureAppMeta,
  isSchemaUpToDate,
  markSchemaUpToDate,
  addMissingColumns,
  shouldRunPlanningJfScrub,
  markPlanningJfScrubDone,
} = require("./schemaStartup");
const { buildProjectsListQuery } = require("./projectQueries");
const { applyConceptApprovalRules, parseDrawingsHistory } = require("./drawingsStatusRules");
const app = express();

/** False until migrations finish; API returns 503 until then (server listens immediately). */
let serverReady = false;

const AI_RENDER_FILENAME = "AI Render.png";

/**
 * Stored paths match Drawings / Colours pages (e.g. Z:\...\file.pdf).
 * Accept optional file:// URLs. Normalizes slashes for fs.* on Windows.
 */
function resolveStoredFilesystemPath(location) {
  if (location == null) return "";
  let s = String(location).trim();
  if (!s) return "";
  if (/^file:/i.test(s)) {
    try {
      s = fileURLToPath(s);
    } catch {
      return "";
    }
  }
  return path.normalize(s);
}

/** En dash / em dash / Unicode minus → ASCII hyphen (job folder names must match on disk). */
function normalizeAddressHyphensForFilesystem(s) {
  if (s == null) return "";
  return String(s).replace(/[\u2013\u2014\u2212]/g, "-");
}

const WIN_FILENAME_ILLEGAL_CHARS = /[<>:"/\\|?*]/g;

function buildJobProjectFolderName(suburb, street) {
  const sub = normalizeAddressHyphensForFilesystem(suburb ?? "").toUpperCase();
  const st = normalizeAddressHyphensForFilesystem(street ?? "");
  return `${sub} - ${st}`.replace(WIN_FILENAME_ILLEGAL_CHARS, "_");
}

/** Common street-type variants accepted for folder matching. */
const STREET_TYPE_CANONICAL_MAP = {
  STREET: "STREET",
  ST: "STREET",
  STRE: "STREET",
  STS: "STREET",
  AVENUE: "AVENUE",
  AVE: "AVENUE",
  AV: "AVENUE",
  CRESCENT: "CRESCENT",
  CRES: "CRESCENT",
  CR: "CRESCENT",
  ROAD: "ROAD",
  RD: "ROAD",
  DRIVE: "DRIVE",
  DR: "DRIVE",
  COURT: "COURT",
  CT: "COURT",
  PLACE: "PLACE",
  PL: "PLACE",
  LANE: "LANE",
  LN: "LANE",
  TERRACE: "TERRACE",
  TCE: "TERRACE",
  CLOSE: "CLOSE",
  CL: "CLOSE",
  BOULEVARD: "BOULEVARD",
  BLVD: "BOULEVARD",
  HIGHWAY: "HIGHWAY",
  HWY: "HIGHWAY",
  PARADE: "PARADE",
  PDE: "PARADE",
  CIRCUIT: "CIRCUIT",
  CCT: "CIRCUIT",
};

function normalizeAddressTokenString(s) {
  return normalizeAddressHyphensForFilesystem(String(s || ""))
    .toUpperCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseStreetForFolderMatch(streetRaw) {
  const normalized = normalizeAddressTokenString(streetRaw);
  if (!normalized) return { number: "", name: "", type: "" };
  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length === 0) return { number: "", name: "", type: "" };

  const number = /^\d+[A-Z]?$/.test(tokens[0]) ? tokens[0] : "";
  const afterNumber = number ? tokens.slice(1) : tokens.slice();
  if (afterNumber.length === 0) return { number, name: "", type: "" };

  const last = afterNumber[afterNumber.length - 1];
  const type = STREET_TYPE_CANONICAL_MAP[last] || "";
  const nameTokens = type ? afterNumber.slice(0, -1) : afterNumber;
  const name = nameTokens.join(" ").trim();
  return { number, name, type };
}

function parseProjectFolderLeaf(folderLeaf) {
  const raw = String(folderLeaf || "");
  const sep = raw.indexOf(" - ");
  if (sep < 0) return null;
  return {
    suburb: raw.slice(0, sep).trim(),
    street: raw.slice(sep + 3).trim(),
  };
}

/**
 * Strict-but-lenient folder matching:
 * - suburb exact (case-insensitive, dash-normalized)
 * - street number exact
 * - street name exact
 * - street type allows common abbreviations (Street/St, Avenue/Ave/Av, Crescent/Cres/Cr, etc)
 */
function isLenientAddressFolderMatch(projectSuburb, projectStreet, folderLeaf) {
  const parsedLeaf = parseProjectFolderLeaf(folderLeaf);
  if (!parsedLeaf) return false;

  const suburbA = normalizeAddressTokenString(projectSuburb);
  const suburbB = normalizeAddressTokenString(parsedLeaf.suburb);
  if (!suburbA || !suburbB || suburbA !== suburbB) return false;

  const pStreet = parseStreetForFolderMatch(projectStreet);
  const fStreet = parseStreetForFolderMatch(parsedLeaf.street);
  if (!pStreet.number || !fStreet.number || pStreet.number !== fStreet.number) return false;
  if (!pStreet.name || !fStreet.name || pStreet.name !== fStreet.name) return false;
  if (!pStreet.type || !fStreet.type || pStreet.type !== fStreet.type) return false;
  return true;
}

async function findBestProjectFolderPathLenient(rootDir, projectYear, stateUpper, suburb, street) {
  const stateDir = path.join(rootDir, projectYear, stateUpper);
  let entries = [];
  try {
    entries = await fs.readdir(stateDir, { withFileTypes: true });
  } catch {
    return "";
  }
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  if (dirs.length === 0) return "";

  const exactLeaf = buildJobProjectFolderName(suburb, street);
  if (dirs.includes(exactLeaf)) {
    return path.join(stateDir, exactLeaf);
  }

  const matches = dirs.filter((leaf) => isLenientAddressFolderMatch(suburb, street, leaf));
  if (matches.length === 0) return "";
  matches.sort((a, b) => a.localeCompare(b));
  return path.join(stateDir, matches[0]);
}

const DRAWINGS_JOB_FOLDER_MISMATCH_ALERT_TO = "ben@superiorgrannyflats.com.au";

/** Root for job-folder layout: matches Drawings page / `projectFolderPath` (VIC vs QLD). */
function resolveRootDirForProjectDrawings(settingsRow, stateUpper) {
  const s = String(stateUpper || "").trim().toUpperCase();
  if (s === "VIC" || s === "VICTORIA") {
    return String(settingsRow?.root_directory || "").trim();
  }
  if (s === "QLD" || s === "QUEENSLAND") {
    return String(settingsRow?.root_directory_qld || settingsRow?.root_directory || "").trim();
  }
  return String(settingsRow?.root_directory || "").trim();
}

function projectDisplayNameForDrawingsAlert(row) {
  const street = String(row?.street || "").trim();
  const suburb = String(row?.suburb || "").trim();
  if (street && suburb) return `${street}, ${suburb}`;
  const n = String(row?.name || "").trim();
  if (n) return n;
  const id = row?.id;
  return id != null ? `Project #${id}` : "Unknown project";
}

async function getDefaultSystemSmtpFrom(pool) {
  if (!pool) {
    const u = (process.env.SMTP_USER || "").trim();
    return u || "";
  }
  try {
    const r = await pool.query("SELECT smtp_user_1 FROM settings WHERE id = 1");
    const u = r.rows[0]?.smtp_user_1;
    if (u && String(u).trim()) return String(u).trim();
  } catch (e) {
    console.warn("getDefaultSystemSmtpFrom:", e?.message || e);
  }
  return (process.env.SMTP_USER || "").trim();
}

async function pathExistsAsDirectory(absPath) {
  try {
    const st = await fs.stat(path.resolve(absPath));
    return st.isDirectory();
  } catch {
    return false;
  }
}

/**
 * When drawings upload is blocked because the exact job folder is missing on disk,
 * notify Ben. Uses default SMTP slot 1 / env.
 */
async function sendDrawingsJobFolderMismatchAlertEmail(pool, { projectId, projectName, expectedFolderPath }) {
  const from = await getDefaultSystemSmtpFrom(pool);
  if (!from) {
    console.warn("sendDrawingsJobFolderMismatchAlertEmail: no SMTP from; email not sent");
    return { sent: false, reason: "no_smtp_from" };
  }
  const creds = await getSmtpCredentialsForFromAddress(from);
  if (!creds.smtpUser || !creds.smtpPass) {
    console.warn("sendDrawingsJobFolderMismatchAlertEmail: no SMTP credentials");
    return { sent: false, reason: "no_smtp_credentials" };
  }
  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true";
  const subject = `Drawings upload blocked — job folder not found (${projectName})`;
  const safePath = String(expectedFolderPath || "").replace(/</g, "&lt;");
  const htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
<p><strong>Job folder does not exist on disk (exact path expected from suburb/street).</strong></p>
<p><strong>Project:</strong> ${String(projectName || "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}<br/>
<strong>Project ID:</strong> ${projectId}</p>
<p><strong>Expected folder:</strong><br/><span style="word-break: break-all;">${safePath}</span></p>
<p>Someone tried to upload drawings in SGF Central; the upload was blocked until this folder exists and matches exactly.</p>
</body></html>`;
  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: creds.smtpUser, pass: creds.smtpPass },
    });
    await transporter.sendMail({
      from,
      to: DRAWINGS_JOB_FOLDER_MISMATCH_ALERT_TO,
      subject,
      html: htmlBody,
    });
    return { sent: true };
  } catch (e) {
    console.error("sendDrawingsJobFolderMismatchAlertEmail:", e);
    return { sent: false, reason: e?.message || String(e) };
  }
}

function projectDirectoryFromColoursOrDrawings(coloursPdfLocation, drawingsPdfLocation) {
  const c = resolveStoredFilesystemPath(coloursPdfLocation);
  const d = resolveStoredFilesystemPath(drawingsPdfLocation);
  if (c) return path.dirname(c);
  if (d) return path.dirname(d);
  return null;
}
app.use(cors({ origin: true }));

app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    const userId = req.headers["x-user-id"] || req.headers["X-User-Id"];
    if (userId) {
      touchUserPresence(userId);
    }
  }
  next();
});

// Block API until migrations complete (health always allowed)
app.use((req, res, next) => {
  if (serverReady || req.path === "/health") return next();
  if (req.path.startsWith("/api")) {
    return res.status(503).json({
      ok: false,
      starting: true,
      message: "Server is starting up, please retry shortly.",
    });
  }
  next();
});

app.get("/health", (req, res) => {
  res.json({ ok: true, db: !!pool, ready: serverReady, schemaVersion: SCHEMA_VERSION });
});

// Outbound email links (View Drawings, colours portal, variation approve, etc.).
// Sending staff often use localhost or a LAN IP; `linkBaseUrl` from the browser would break phones and off-site PCs.
// Recipients open the live app here unless overridden by DB `public_app_url` or `PUBLIC_APP_URL`.
const DEFAULT_EMAIL_PUBLIC_APP_ORIGIN = "https://portal.superiorgrannyflats.com.au";

// Increase body size limit for file uploads (50MB)
// Only parse JSON for requests with application/json content-type (skip multipart/form-data)
const jsonParser = express.json({ limit: '50mb' });
const urlencodedParser = express.urlencoded({ limit: '50mb', extended: true });

app.use((req, res, next) => {
  const contentType = (req.get('content-type') || '').toLowerCase();
  console.log("Body parser middleware - Content-Type:", contentType, "Path:", req.path);
  
  // CRITICAL: Skip parsing for multipart/form-data (let multer handle it)
  if (contentType.includes('multipart/form-data')) {
    console.log("Skipping body parsing for multipart/form-data request");
    return next();
  }
  // Parse JSON requests
  if (contentType.includes('application/json')) {
    console.log("Parsing as JSON");
    return jsonParser(req, res, next);
  }
  // Parse URL-encoded requests
  if (contentType.includes('application/x-www-form-urlencoded')) {
    console.log("Parsing as URL-encoded");
    return urlencodedParser(req, res, next);
  }
  // Skip parsing for other content types (no content-type header, etc.)
  console.log("Skipping body parsing (no matching content-type)");
  next();
});

// Configure multer for file uploads (store in memory, 50MB limit)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB in bytes
  }
});

// Helper: whether the request user has Admin checked in Permissions
async function isAdminRequest(req) {
  try {
    if (!pool) return false;
    const userId = Number(req.headers["x-user-id"] || req.headers["X-User-Id"]);
    if (!Number.isFinite(userId)) return false;
    return userHasAccessGrant(pool, userId, "admin");
  } catch (e) {
    console.error("Error checking admin access:", e);
    return false;
  }
}

// Helper: whether the request user has Sales checked in Permissions
async function isSalesRequest(req) {
  try {
    if (!pool) return false;
    const userId = Number(req.headers["x-user-id"] || req.headers["X-User-Id"]);
    if (!Number.isFinite(userId)) return false;
    return userHasAccessGrant(pool, userId, "sales");
  } catch (e) {
    console.error("Error checking sales access:", e);
    return false;
  }
}

// ------------------------------------------------------------
// Serve the built frontend (Vite dist) on the same port
// ------------------------------------------------------------
const frontendDist = path.join(__dirname, "..", "frontend", "dist");

app.get(["/", "/index.html"], (req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

// Serve playground.html from root directory - BEFORE static middleware
app.get("/playground.html", async (req, res) => {
  try {
    const playgroundPath = path.join(__dirname, "..", "playground.html");
    const html = await fs.readFile(playgroundPath, "utf8");
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (error) {
    console.error("Error serving playground.html:", error);
    res.status(404).send("Playground file not found");
  }
});

// Serve static assets (JS, CSS, images) - these are always allowed
// This comes AFTER the root route handler so index.html is handled above
app.use(express.static(frontendDist, { index: false })); // index: false prevents serving index.html automatically

// SPA fallback: for any other non-API route, return index.html
app.get(/^\/(?!api).*/, (req, res) => {
  // Allow approval page and colours portal without authentication (secret pages for clients)
  if (req.path.startsWith("/approve-concept/") || req.path.startsWith("/colours-portal/") || req.path.startsWith("/3d-vis-portal/")) {
    return res.sendFile(path.join(frontendDist, "index.html"));
  }

  res.sendFile(path.join(frontendDist, "index.html"));
});

const PORT = process.env.PORT || 3001;

// Log startup clearly
console.log("Starting SGF backend…");

if (!process.env.DATABASE_URL) {
  console.log("⚠️  DATABASE_URL is not set.");
  console.log("The API will run, but DB routes will return errors.");
}

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.PGSSL === "true"
          ? { rejectUnauthorized: false }
          : undefined,
    })
  : null;

const { DRAFTSPERSON_UNASSIGNED } = require("./draftspersonConstants");

/** For email tokens: empty when unassigned sentinel. */
function draftspersonTokenDisplay(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (s.toLowerCase() === DRAFTSPERSON_UNASSIGNED.toLowerCase()) return "";
  return s;
}

/** Settings table: smtp_user_1..smtp_pass_16 (for SQL SELECT / RETURNING fragments). */
const SETTINGS_SMTP_1_16_COLUMNS = Array.from({ length: 16 }, (_, j) => {
  const n = j + 1;
  return `smtp_user_${n}, smtp_pass_${n}`;
}).join(", ");

/** settings.stream_settings_json may be TEXT (string) or JSON/JSONB (object) depending on driver/column type. */
function parseStreamSettingsJsonColumn(raw) {
  if (raw == null || raw === "") return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const o = JSON.parse(raw);
      return o && typeof o === "object" && !Array.isArray(o) ? o : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** Settings → Email Settings → General → Hot List (global; VIC vs QLD by project state, not stream). */
function parseEmailGeneralJsonColumn(raw) {
  const emptyHotList = {
    soldFromEmail: "",
    soldToEmail: "",
    qldSoldFromEmail: "",
    qldSoldToEmail: "",
  };
  const empty = { hotList: { ...emptyHotList } };
  if (raw == null || raw === "") return empty;
  let o = raw;
  if (typeof raw === "string") {
    try {
      o = JSON.parse(raw);
    } catch {
      return empty;
    }
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return empty;
  const hl = o.hotList && typeof o.hotList === "object" && !Array.isArray(o.hotList) ? o.hotList : {};
  const dbRoot =
    o.depositBalance && typeof o.depositBalance === "object" && !Array.isArray(o.depositBalance)
      ? o.depositBalance
      : {};
  const trim = (v) => (v == null ? "" : String(v).trim());
  const normalizeDepositBalanceBranch = (raw) => {
    const b = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    return {
      clientFromEmail: trim(b.clientFromEmail),
      teamFromEmail: trim(b.teamFromEmail),
      teamToEmail: trim(b.teamToEmail),
    };
  };
  return {
    ...o,
    hotList: {
      soldFromEmail: trim(hl.soldFromEmail),
      soldToEmail: trim(hl.soldToEmail),
      qldSoldFromEmail: trim(hl.qldSoldFromEmail),
      qldSoldToEmail: trim(hl.qldSoldToEmail),
    },
    depositBalance: {
      vic: normalizeDepositBalanceBranch(dbRoot.vic),
      qld: normalizeDepositBalanceBranch(dbRoot.qld),
    },
  };
}

const UI_BUTTON_STYLE_COLOR_KEYS = [
  "colorSelected",
  "colorUnselected",
  "outlineSelected",
  "outlineUnselected",
  "textSelected",
  "textUnselected",
];

function normalizeUiButtonStyleRecord(raw, fallbackId = null) {
  if (!raw || typeof raw !== "object") return null;
  const id = Number(raw.id ?? fallbackId);
  if (!Number.isFinite(id) || id < 1) return null;
  const trim = (v, fb = "") => String(v ?? fb).trim();
  const record = {
    id,
    width: trim(raw.width, "120px"),
    height: trim(raw.height, "48px"),
    fontSize: trim(raw.fontSize, "0.9rem"),
  };
  for (const key of UI_BUTTON_STYLE_COLOR_KEYS) {
    record[key] = trim(raw[key], "textPrimary");
  }
  return record;
}

function normalizeUiButtonStylesStore(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return { nextId: 1, buttons: {} };
  }
  const rawButtons = parsed.buttons && typeof parsed.buttons === "object" ? parsed.buttons : {};
  const buttons = {};
  for (const [key, value] of Object.entries(rawButtons)) {
    const record = normalizeUiButtonStyleRecord(value, key);
    if (record) buttons[String(record.id)] = record;
  }
  const ids = Object.values(buttons)
    .map((b) => Number(b.id))
    .filter((n) => Number.isFinite(n));
  const maxId = ids.length ? Math.max(...ids) : 0;
  const nextId = Math.max(Number(parsed.nextId) || 1, maxId + 1);
  return { nextId, buttons };
}

function parseUiButtonStylesJsonColumn(raw) {
  if (raw == null || raw === "") return { nextId: 1, buttons: {} };
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return normalizeUiButtonStylesStore(raw);
  }
  if (typeof raw === "string") {
    try {
      return normalizeUiButtonStylesStore(JSON.parse(raw));
    } catch {
      return { nextId: 1, buttons: {} };
    }
  }
  return { nextId: 1, buttons: {} };
}

const UI_THEME_IDS = new Set([
  "classic",
  "dark",
  "light",
  "bladeRunner",
  "autumn",
  "winter",
  "summer",
  "spring",
  "christmas",
  "rainbow",
  "oldTime",
  "retro",
]);

function normalizeUiThemeId(value) {
  const id = String(value || "").trim();
  return UI_THEME_IDS.has(id) ? id : "classic";
}

function normalizeUiThemeColorOverrides(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out = {};
  for (const [themeId, themePatch] of Object.entries(parsed)) {
    if (!UI_THEME_IDS.has(themeId)) continue;
    if (!themePatch || typeof themePatch !== "object" || Array.isArray(themePatch)) continue;
    const colors = {};
    for (const [colorKey, colorValue] of Object.entries(themePatch)) {
      const v = String(colorValue ?? "").trim();
      if (v) colors[colorKey] = v;
    }
    if (Object.keys(colors).length > 0) out[themeId] = colors;
  }
  return out;
}

function parseUiThemeColorOverridesColumn(raw) {
  if (raw == null || raw === "") return {};
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return normalizeUiThemeColorOverrides(raw);
  }
  if (typeof raw === "string") {
    try {
      return normalizeUiThemeColorOverrides(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  return {};
}

/** Match template From → slot (same order as former secondary → vic → QLD → 5–16 → primary). */
const SMTP_FROM_ADDRESS_MATCH_ORDER = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 1];

/** Default outbound account for non–From-matched sends: slot 1 (legacy “primary”). QLD-specific routes use slot 4 (legacy QLD). */
const SMTP_SLOT_DEFAULT = 1;
const SMTP_SLOT_QLD = 4;

/** One-time copy from legacy smtp_user / secondary / vic / qld columns into smtp_user_1–4 when numbered slots are empty. */
async function migrateLegacySmtpIntoNumberedSlots() {
  if (!pool) return;
  try {
    const r = await pool.query("SELECT * FROM settings WHERE id = 1");
    if (!r.rows.length) return;
    const row = r.rows[0];
    const mappings = [
      ["smtp_user_1", "smtp_pass_1", "smtp_user", "smtp_pass"],
      ["smtp_user_2", "smtp_pass_2", "smtp_user_secondary", "smtp_pass_secondary"],
      ["smtp_user_3", "smtp_pass_3", "smtp_user_vic_smtp", "smtp_pass_vic_smtp"],
      ["smtp_user_4", "smtp_pass_4", "smtp_user_qld", "smtp_pass_qld"],
    ];
    const setParts = [];
    const vals = [];
    let idx = 1;
    for (const [newUserCol, newPassCol, oldUserCol, oldPassCol] of mappings) {
      const newU = row[newUserCol];
      const oldU = row[oldUserCol];
      const newHas = newU != null && String(newU).trim() !== "";
      const oldHas = oldU != null && String(oldU).trim() !== "";
      if (!newHas && oldHas) {
        setParts.push(`${newUserCol} = $${idx++}`, `${newPassCol} = $${idx++}`);
        vals.push(oldU, row[oldPassCol] != null ? row[oldPassCol] : null);
      }
    }
    if (setParts.length) {
      await pool.query(`UPDATE settings SET ${setParts.join(", ")} WHERE id = 1`, vals);
      console.log("SMTP: migrated legacy columns into smtp_user_1–4 where numbered slots were empty.");
    }
  } catch (e) {
    console.error("migrateLegacySmtpIntoNumberedSlots:", e.message);
  }
}

/** Planning UI: alien mascot (backend/alien.png). Alpha is flattened onto white so transparency checkerboard does not show. */
app.get("/api/assets/alien.png", async (req, res) => {
  const filePath = path.join(__dirname, "alien.png");
  if (!fsSync.existsSync(filePath)) {
    return res.status(404).end();
  }
  try {
    const buf = await fs.readFile(filePath);
    const meta = await sharp(buf).metadata();
    if (meta.hasAlpha) {
      const flattened = await sharp(buf)
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .png({ compressionLevel: 9 })
        .toBuffer();
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.send(flattened);
    }
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(buf);
  } catch (e) {
    console.error("Serve alien.png:", e);
    res.status(500).end();
  }
});

// --- BenBox: list contents under a fixed root (default Z:\1.SGF PROJECT MANAGEMENT) ---
function getBenBoxRoot() {
  const raw = process.env.BENBOX_ROOT || path.join("Z:", "1.SGF PROJECT MANAGEMENT");
  return path.resolve(raw);
}

function resolveBenBoxDir(relPath) {
  const root = getBenBoxRoot();
  const parts = String(relPath || "")
    .replace(/^[\\/]+/, "")
    .split(/[/\\]+/)
    .filter((p) => p && p !== "." && p !== "..");
  let target = root;
  for (const p of parts) {
    target = path.join(target, p);
  }
  target = path.resolve(target);
  const rel = path.relative(root, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    const err = new Error("Path outside BenBox root");
    err.code = "EPATH";
    throw err;
  }
  return target;
}

app.get("/api/benbox/list", async (req, res) => {
  try {
    const rel = (req.query.path || "").toString();
    const dir = resolveBenBoxDir(rel);
    const root = getBenBoxRoot();
    let st;
    try {
      st = await fs.stat(dir);
    } catch (e) {
      if (e.code === "ENOENT") {
        return res.status(404).json({ error: "Folder not found", path: dir });
      }
      throw e;
    }
    if (!st.isDirectory()) {
      return res.status(400).json({ error: "Not a folder", path: dir });
    }
    const names = await fs.readdir(dir);
    const entries = await Promise.all(
      names.map(async (name) => {
        const full = path.join(dir, name);
        try {
          const s = await fs.stat(full);
          const isDirectory = s.isDirectory();
          const ext = path.extname(name);
          const extClean = ext.replace(/^\./, "").toLowerCase();
          return {
            name,
            isDirectory,
            size: isDirectory ? null : s.size,
            modified: s.mtime.toISOString(),
            extension: isDirectory ? null : extClean || null,
          };
        } catch {
          return null;
        }
      })
    );
    const list = entries.filter(Boolean);
    list.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
    const currentRel = path.relative(root, dir);
    const normalizedRel = currentRel ? currentRel.split(path.sep).join("/") : "";
    let parentRel = null;
    if (normalizedRel) {
      const parentDir = path.dirname(dir);
      const pr = path.relative(root, parentDir);
      parentRel = pr ? pr.split(path.sep).join("/") : "";
    }
    res.json({
      root,
      path: normalizedRel,
      parentPath: parentRel,
      entries: list.map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory,
        size: e.size,
        modified: e.modified,
        extension: e.extension,
        typeLabel: e.isDirectory ? "File folder" : e.extension ? `${e.extension.toUpperCase()} file` : "File",
      })),
    });
  } catch (e) {
    if (e.code === "EPATH") {
      return res.status(403).json({ error: e.message });
    }
    console.error("GET /api/benbox/list:", e);
    res.status(500).json({ error: e.message || "Failed to list folder" });
  }
});

// --- Pricing catalog (Excel: column E = product, column N = price) ---
const PRICING_COL_PRODUCT = 4; // E
const PRICING_COL_PRICE = 13; // N
let pricingCatalogCache = null;
let pricingCatalogMtime = null;

function getPricingCatalogPath() {
  return process.env.PRICING_CATALOG_XLSX || path.join(__dirname, "..", "attachments", "PricingCatalog.xlsx");
}

async function loadPricingCatalogRows() {
  const catPath = getPricingCatalogPath();
  let st;
  try {
    st = await fs.stat(catPath);
  } catch {
    return { error: `Pricing catalog not found: ${catPath}`, rows: null };
  }
  if (pricingCatalogCache != null && pricingCatalogMtime === st.mtimeMs) {
    return { rows: pricingCatalogCache };
  }
  const buf = await fs.readFile(catPath);
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
  const rows = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const product =
      row[PRICING_COL_PRODUCT] != null ? String(row[PRICING_COL_PRODUCT]).trim() : "";
    const price = row[PRICING_COL_PRICE] != null ? String(row[PRICING_COL_PRICE]).trim() : "";
    if (!product && !price) continue;
    rows.push({ rowIndex: i + 1, product, price });
  }
  pricingCatalogCache = rows;
  pricingCatalogMtime = st.mtimeMs;
  return { rows };
}

app.get("/api/pricing-catalog/search", async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim().toLowerCase();
    const { rows, error } = await loadPricingCatalogRows();
    if (error) {
      return res.status(404).json({
        error,
        matches: [],
        path: getPricingCatalogPath(),
      });
    }
    if (!q) {
      return res.json({ matches: [], totalRows: rows.length, path: getPricingCatalogPath() });
    }
    const matches = rows.filter((r) => r.product.toLowerCase().includes(q));
    res.json({
      matches: matches.slice(0, 500),
      totalRows: rows.length,
      count: matches.length,
      path: getPricingCatalogPath(),
    });
  } catch (e) {
    console.error("GET /api/pricing-catalog/search:", e);
    res.status(500).json({ error: e.message || "Search failed", matches: [] });
  }
});

app.get("/api/pricing-catalog/meta", async (req, res) => {
  try {
    const { rows, error } = await loadPricingCatalogRows();
    const p = getPricingCatalogPath();
    if (error) {
      return res.json({ ok: false, error, path: p, rowCount: 0 });
    }
    res.json({ ok: true, path: p, rowCount: rows.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Ensure schema
async function ensureSchema() {
  if (!pool) return;
  await ensureAppMeta(pool);
  if (await isSchemaUpToDate(pool)) {
    console.log(`Schema ${SCHEMA_VERSION} already applied — skipping migrations`);
    await ensureProjectAccessTokens(pool);
    await ensureMapQuoteItemsTable(pool);
    await ensureUserAccessPermissionsTable(pool);
    await ensureUserMessagesTable(pool);
    await ensureMapFloorPlansDollarValueColumn(pool);
    await addMissingColumns(pool, "projects", ["construction_payments_paid"]);
    await addMissingColumns(pool, "settings", ["ui_button_styles_json", "ui_theme_color_overrides_json"]);
    await addMissingColumns(pool, "users", ["password", "ui_theme_id"]);
    await pool.query(`UPDATE users SET password = 'admin' WHERE password IS NULL OR password = ''`);
    return;
  }
  console.log(`Applying schema migrations (target ${SCHEMA_VERSION})…`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Design Phase',
      suburb TEXT,
      street TEXT,
      client_name TEXT,
      email TEXT,
      phone TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  // Create users table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  // Add phone column if it doesn't exist (for existing tables)
  try {
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='users' AND column_name='phone'
        ) THEN
          ALTER TABLE users ADD COLUMN phone TEXT;
        END IF;
      END $$;
    `);
  } catch (e) {
    console.log(`Column phone might already exist:`, e.message);
  }
  // Add primary_position_id column if it doesn't exist
  try {
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='users' AND column_name='primary_position_id'
        ) THEN
          ALTER TABLE users ADD COLUMN primary_position_id INTEGER;
        END IF;
      END $$;
    `);
  } catch (e) {
    console.log(`Column primary_position_id might already exist:`, e.message);
  }
  // Add password column if it doesn't exist (per-user login)
  try {
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='users' AND column_name='password'
        ) THEN
          ALTER TABLE users ADD COLUMN password TEXT DEFAULT 'admin';
        END IF;
      END $$;
    `);
    await pool.query(`UPDATE users SET password = 'admin' WHERE password IS NULL OR password = ''`);
  } catch (e) {
    console.log(`Column password might already exist:`, e.message);
  }
  // Create positions table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS positions (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  // Create email_templates table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      template_group TEXT,
      to_addresses TEXT,
      from_address TEXT,
      subject TEXT,
      body TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_template_groups (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  // Add template_group column if it doesn't exist (for grouping email templates in UI)
  try {
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='email_templates' AND column_name='template_group'
        ) THEN
          ALTER TABLE email_templates ADD COLUMN template_group TEXT;
        END IF;
      END $$;
    `);
  } catch (e) {
    console.log(`Column template_group might already exist:`, e.message);
  }
  // Create user_positions junction table for many-to-many relationship
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_positions (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      position_id INTEGER NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, position_id)
    );
  `);
  // Create substatuses table to store all possible substatuses and their details
  await pool.query(`
    CREATE TABLE IF NOT EXISTS substatuses (
      id SERIAL PRIMARY KEY,
      substatus TEXT NOT NULL,
      detail TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(substatus, detail)
    );
  `);
  // Initialize default substatuses and details
  const defaultSubstatuses = [
    { substatus: "Town Planning", detail: "Further Information Required" },
    { substatus: "Town Planning", detail: "Section 50 Advertising" },
    { substatus: "Town Planning", detail: "Planning Permit Received – Waiting Flood Consent" },
    { substatus: "Town Planning", detail: "Waiting Arborist Report" },
    { substatus: "Town Planning", detail: "Planner on Leave" },
    { substatus: "Town Planning", detail: "Waiting Hydraulic Engineer Assessment" },
    { substatus: "VicSmart", detail: "Waiting Hydraulic Engineer Assessment" },
    { substatus: "Waiting", detail: "Covenant Removal" },
    { substatus: "Waiting", detail: "Deposit Balance" },
    { substatus: "Waiting", detail: "Hydraulic Engineering" },
    { substatus: "Waiting", detail: "Vince Assessment" },
    { substatus: "Waiting", detail: "PIC" },
    { substatus: "Waiting", detail: "Engineering" },
    { substatus: "Waiting", detail: "Approved Working Drawings" },
    { substatus: "Waiting", detail: "Approved Concept Drawings" },
    { substatus: "Waiting", detail: "Signed Contract and Docs" },
    { substatus: "Waiting", detail: "Septic Permit" },
    { substatus: "Waiting", detail: "JCA & Soil" },
  ];
  for (const item of defaultSubstatuses) {
    try {
      await pool.query(`
        INSERT INTO substatuses (substatus, detail)
        VALUES ($1, $2)
        ON CONFLICT (substatus, detail) DO NOTHING
      `, [item.substatus, item.detail]);
    } catch (e) {
      // Ignore errors for existing entries
    }
  }
  // Add new columns if they don't exist (for existing tables)
  // NOTE: 'year' field stores the project start DATE in YYYY-MM-DD format (this is the single date field for projects)
  // The year is ALWAYS derived from this date field - never stored separately
  const columnsToAdd = [
    'suburb', 'street', 'client_name', 'email', 'phone', 'stream', 'state', 'year',
    'deposit',
    'client1_name', 'client1_email', 'client1_phone', 'client1_active',
    'client2_name', 'client2_email', 'client2_phone', 'client2_active',
    'client3_name', 'client3_email', 'client3_phone', 'client3_active',
    'client_notes',
    'project_cost', 'salesperson', 'proposal_pdf_location',
    'site_visit_status', 'site_visit_date', 'site_visit_time', 'site_visit_notes', 'site_visit_scheduled_date', 'site_visit_scheduled_period',
    'contract_status', 'contract_sent_date', 'contract_complete_date',
    'supporting_documents_status', 'supporting_documents_sent_date', 'supporting_documents_complete_date',
    'water_authority', 'water_declaration_status', 'water_declaration_sent_date', 'water_declaration_complete_date',
    'notes', 'project_info_notes', 'specs', 'classification', 'project_log',
    'window_status', 'window_colour', 'window_reveal', 'window_reveal_other', 'window_glazing', 'window_bal_rating', 'window_date_required', 'window_ordered_date', 'window_order_pdf_location', 'window_order_number',
    'drawings_status', 'drawings_pdf_location', 'drawings_history', 'drawings_viewed_date', 'drawings_sent_to_client_date', 'drawings_holder_date', 'draftsperson', 'drawings_holder', 'drawing_manager_notes', 'colours_status', 'colours_notes', 'colours_pdf_location', 'colours_sent_date', 'colours_reminder_sent_date', 'roof_colour', 'cladding_colour', 'baseboards_colour', 'roof_style', 'planning_status', 'energy_report_status', 'footing_certification_status', 'building_permit_status', 'septic_permit', 'septic_notes', 'septic_email_sent_date', 'pic',
    'number_of_robes', 'robe_widths', 'robe_plan_pdf_location', 'robe_colours_pdf_location', 'substatus', 'substatus_detail', 'on_hold', 'survey_status', 'soil_status', 'agreement_sent', 'hotlist_notes', 'qp_number',
    'planning_jf_planning_property_report_path', 'planning_jf_title_covenant_subdivision_path', 'planning_jf_title_path', 'planning_jf_covenant_path', 'planning_jf_section_173_agreement_path', 'planning_jf_plan_of_subdivision_path', 'planning_jf_ebyda_stormwater_path', 'planning_jf_byda_sewer_main_path', 'planning_jf_internal_sewer_plan_path', 'planning_jf_sewer_main_size_depth_offset_path', 'planning_jf_legal_point_discharge_path', 'planning_jf_property_info_report_path',
    'planning_jf_job_file_pdf_path',
    'planning_written_advice', 'planning_written_advice_requested_at', 'planning_written_advice_received_at',
    'planning_town_planning', 'planning_town_planning_requested_at', 'planning_town_planning_received_at',
    'planning_land_flooding_regulation',
    'planning_land_flooding_fpa_requested_at',
    'planning_land_flooding_fpa_received_at',
    'planning_land_flooding_cc_requested_at',
    'planning_land_flooding_cc_received_at',
    'planning_bal', 'planning_bal_requested_at', 'planning_bal_received_at',
    'planning_footing_certification_requested_at', 'planning_footing_certification_received_at',
    'planning_energy_report_requested_at', 'planning_energy_report_received_at',
    'planning_energy_specs_added_to_plans', 'construction_payments_paid'];
  await addMissingColumns(pool, "projects", columnsToAdd);

  // Project map cache (lat/lng persisted so maps don't re-geocode every time)
  try {
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'project_lat'
        ) THEN
          ALTER TABLE projects ADD COLUMN project_lat DOUBLE PRECISION;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'project_lng'
        ) THEN
          ALTER TABLE projects ADD COLUMN project_lng DOUBLE PRECISION;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'project_geocoded_at'
        ) THEN
          ALTER TABLE projects ADD COLUMN project_geocoded_at TIMESTAMPTZ;
        END IF;
      END $$;
    `);
  } catch (e) {
    console.log("Project map cache columns:", e.message);
  }
  try {
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'duplicate_source_project_id'
        ) THEN
          ALTER TABLE projects ADD COLUMN duplicate_source_project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  } catch (e) {
    console.log("Column duplicate_source_project_id:", e.message);
  }
  // Planning "Job file documents" statuses: never NULL — default and backfill "Not Done", NOT NULL.
  const PLANNING_JF_DOC_COLUMNS = [
    "planning_jf_planning_property_report",
    "planning_jf_title",
    "planning_jf_covenant",
    "planning_jf_section_173_agreement",
    "planning_jf_plan_of_subdivision",
    "planning_jf_ebyda_stormwater",
    "planning_jf_byda_sewer_main",
    "planning_jf_internal_sewer_plan",
    "planning_jf_sewer_main_size_depth_offset",
    "planning_jf_legal_point_discharge",
    "planning_jf_property_info_report",
  ];
  for (const col of PLANNING_JF_DOC_COLUMNS) {
    try {
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = '${col}'
          ) THEN
            ALTER TABLE projects ADD COLUMN ${col} TEXT NOT NULL DEFAULT 'Not Done';
          END IF;
        END $$;
      `);
      await pool.query(
        `UPDATE projects SET ${col} = 'Not Done' WHERE ${col} IS NULL OR TRIM(COALESCE(${col}, '')) = ''`
      );
      await pool.query(`ALTER TABLE projects ALTER COLUMN ${col} SET DEFAULT 'Not Done'`);
      await pool.query(`ALTER TABLE projects ALTER COLUMN ${col} SET NOT NULL`);
    } catch (e) {
      console.log(`Planning JF doc column ${col}:`, e.message);
    }
  }
  for (const col of PLANNING_JF_DOC_COLUMNS) {
    for (const suffix of ["_requested_at", "_received_at"]) {
      const dcol = `${col}${suffix}`;
      try {
        await pool.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = '${dcol}'
            ) THEN
              ALTER TABLE projects ADD COLUMN ${dcol} TEXT;
            END IF;
          END $$;
        `);
      } catch (e) {
        console.log(`Planning JF doc date column ${dcol}:`, e.message);
      }
    }
  }
  // Copy legacy combined "title/covenant/subdivision" row into `planning_jf_title` when the old column still exists.
  try {
    const legacyCol = await pool.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'planning_jf_title_covenant_subdivision'
      LIMIT 1
    `);
    if (legacyCol.rows.length) {
      await pool.query(`
        UPDATE projects SET
          planning_jf_title = planning_jf_title_covenant_subdivision,
          planning_jf_title_requested_at = planning_jf_title_covenant_subdivision_requested_at,
          planning_jf_title_received_at = planning_jf_title_covenant_subdivision_received_at,
          planning_jf_title_path = planning_jf_title_covenant_subdivision_path
        WHERE TRIM(COALESCE(planning_jf_title, '')) = 'Not Done'
          AND (
            (planning_jf_title_covenant_subdivision_path IS NOT NULL AND TRIM(planning_jf_title_covenant_subdivision_path) <> '')
            OR TRIM(COALESCE(planning_jf_title_covenant_subdivision, '')) NOT IN ('', 'Not Done')
          )
      `);
    }
  } catch (e) {
    console.log("Planning JF migration from planning_jf_title_covenant_subdivision:", e.message);
  }
  // Create settings table (single row for app-wide settings)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      root_directory TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT single_row CHECK (id = 1)
    );
  `);
  // Create learned_answers table for email generator suggestions
  await pool.query(`
    CREATE TABLE IF NOT EXISTS learned_answers (
      id SERIAL PRIMARY KEY,
      question_text TEXT NOT NULL,
      normalized_question TEXT NOT NULL,
      answer_text TEXT NOT NULL,
      category TEXT,
      times_used INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  // Create index on normalized_question for faster searches
  try {
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_learned_answers_normalized_question 
      ON learned_answers(normalized_question);
    `);
  } catch (e) {
    console.log(`Index might already exist:`, e.message);
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS variation_approval_tokens (
      token TEXT PRIMARY KEY,
      project_id INTEGER NOT NULL,
      items_json JSONB NOT NULL,
      consultant_name TEXT NOT NULL,
      notify_email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ
    );
  `);
  try {
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_variation_approval_project ON variation_approval_tokens(project_id);
    `);
  } catch (e) {
    console.log("variation_approval_tokens index:", e.message);
  }
  // Add create_folders column if it doesn't exist (for existing tables)
  try {
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='settings' AND column_name='create_folders'
        ) THEN
          ALTER TABLE settings ADD COLUMN create_folders TEXT DEFAULT 'true';
          UPDATE settings SET create_folders = 'true' WHERE id = 1;
        END IF;
      END $$;
    `);
  } catch (e) {
    console.log(`Column create_folders might already exist:`, e.message);
  }
  // Add smtp_user, smtp_pass columns if they don't exist
  for (const col of ["smtp_user", "smtp_pass", "smtp_user_secondary", "smtp_pass_secondary"]) {
    try {
      await pool.query(`ALTER TABLE settings ADD COLUMN ${col} TEXT`);
    } catch (e) {
      // Column might already exist, which is fine
      if (!e.message.includes("already exists") && !e.message.includes("duplicate column")) {
        console.log(`Error adding column ${col}:`, e.message);
      }
    }
  }
  // Add colour_attachments columns if they don't exist
  for (const col of ["colour_attachments_vic", "colour_attachments_qld"]) {
    try {
      await pool.query(`ALTER TABLE settings ADD COLUMN ${col} TEXT`);
    } catch (e) {
      // Column might already exist, which is fine
      if (!e.message.includes("already exists") && !e.message.includes("duplicate column")) {
        console.log(`Error adding column ${col}:`, e.message);
      }
    }
  }
  // Add send_drawings columns if they don't exist
  for (const col of ["send_drawings_vic", "send_drawings_qld"]) {
    try {
      await pool.query(`ALTER TABLE settings ADD COLUMN ${col} TEXT`);
    } catch (e) {
      // Column might already exist, which is fine
      if (!e.message.includes("already exists") && !e.message.includes("duplicate column")) {
        console.log(`Error adding column ${col}:`, e.message);
      }
    }
  }
  // Numbered SMTP credential slots 1–16 (SMTP Settings grid)
  for (let i = 1; i <= 16; i++) {
    for (const col of [`smtp_user_${i}`, `smtp_pass_${i}`]) {
      try {
        await pool.query(`ALTER TABLE settings ADD COLUMN ${col} TEXT`);
      } catch (e) {
        if (!e.message.includes("already exists") && !e.message.includes("duplicate column")) {
          console.log(`Error adding column ${col}:`, e.message);
        }
      }
    }
  }
  // Embedded email logo (full path to image file; shown inline at end of HTML emails)
  try {
    await pool.query(`ALTER TABLE settings ADD COLUMN email_logo_path TEXT`);
  } catch (e) {
    if (!e.message.includes("already exists") && !e.message.includes("duplicate column")) {
      console.log(`Error adding column email_logo_path:`, e.message);
    }
  }
  // Letterhead image for variation PDFs (emails still use email_logo_path only)
  try {
    await pool.query(`ALTER TABLE settings ADD COLUMN letterhead_path TEXT`);
  } catch (e) {
    if (!e.message.includes("already exists") && !e.message.includes("duplicate column")) {
      console.log(`Error adding column letterhead_path:`, e.message);
    }
  }
  // Per-stream settings (Stream Settings page), JSON object keyed by stream name
  try {
    await pool.query(`ALTER TABLE settings ADD COLUMN stream_settings_json TEXT`);
  } catch (e) {
    if (!e.message.includes("already exists") && !e.message.includes("duplicate column")) {
      console.log(`Error adding column stream_settings_json:`, e.message);
    }
  }
  // Email Settings → General (global JSON; e.g. Hot List sold notification From/To)
  try {
    await pool.query(`ALTER TABLE settings ADD COLUMN email_general_json TEXT`);
  } catch (e) {
    if (!e.message.includes("already exists") && !e.message.includes("duplicate column")) {
      console.log(`Error adding column email_general_json:`, e.message);
    }
  }
  try {
    await pool.query(`ALTER TABLE settings ADD COLUMN ui_button_styles_json TEXT`);
  } catch (e) {
    if (!e.message.includes("already exists") && !e.message.includes("duplicate column")) {
      console.log(`Error adding column ui_button_styles_json:`, e.message);
    }
  }
  try {
    await pool.query(`ALTER TABLE settings ADD COLUMN ui_theme_color_overrides_json TEXT`);
  } catch (e) {
    if (!e.message.includes("already exists") && !e.message.includes("duplicate column")) {
      console.log(`Error adding column ui_theme_color_overrides_json:`, e.message);
    }
  }
  // Drawing Settings page: notification emails (VIC / QLD / Investor Streams)
  for (const col of [
    "drawings_vic_design_to_salesperson_email",
    "drawings_vic_salesperson_to_client_email",
    "drawings_qld_design_to_salesperson_email",
    "drawings_qld_salesperson_to_client_email",
    "drawings_investor_streams_design_to_salesperson_email",
    "drawings_investor_streams_salesperson_to_client_email",
    "drawings_vic_design_to_salesperson_to_email",
    "drawings_qld_design_to_salesperson_to_email",
  ]) {
    try {
      await pool.query(`ALTER TABLE settings ADD COLUMN ${col} TEXT`);
    } catch (e) {
      if (!e.message.includes("already exists") && !e.message.includes("duplicate column")) {
        console.log(`Error adding column ${col}:`, e.message);
      }
    }
  }
  // VIC - SMTP (third account) columns
  for (const col of ["smtp_user_vic_smtp", "smtp_pass_vic_smtp"]) {
    try {
      await pool.query(`ALTER TABLE settings ADD COLUMN ${col} TEXT`);
    } catch (e) {
      if (!e.message.includes("already exists") && !e.message.includes("duplicate column")) {
        console.log(`Error adding column ${col}:`, e.message);
      }
    }
  }
  // Add QLD settings columns if they don't exist
  for (const col of ["root_directory_qld", "create_folders_qld", "smtp_user_qld", "smtp_pass_qld", "test_project_name_qld", "test_folder_qld"]) {
    try {
      await pool.query(`ALTER TABLE settings ADD COLUMN ${col} TEXT`);
    } catch (e) {
      // Column might already exist, which is fine
      if (!e.message.includes("already exists") && !e.message.includes("duplicate column")) {
        console.log(`Error adding column ${col}:`, e.message);
      }
    }
  }
  // Add global_password column if it doesn't exist
  try {
    await pool.query(`ALTER TABLE settings ADD COLUMN global_password TEXT`);
  } catch (e) {
    // Column might already exist, which is fine
    if (!e.message.includes("already exists") && !e.message.includes("duplicate column")) {
      console.log(`Error adding column global_password:`, e.message);
    }
  }
  // Add admin_password column if it doesn't exist
  try {
    await pool.query(`ALTER TABLE settings ADD COLUMN admin_password TEXT`);
  } catch (e) {
    // Column might already exist, which is fine
    if (!e.message.includes("already exists") && !e.message.includes("duplicate column")) {
      console.log(`Error adding column admin_password:`, e.message);
    }
  }
  // Public https (or http) base for outbound email links — set once in File Settings or PUBLIC_APP_URL
  try {
    await pool.query(`ALTER TABLE settings ADD COLUMN public_app_url TEXT`);
  } catch (e) {
    if (!e.message.includes("already exists") && !e.message.includes("duplicate column")) {
      console.log(`Error adding column public_app_url:`, e.message);
    }
  }
  // Insert default row if it doesn't exist
  try {
    await pool.query(`
      INSERT INTO settings (id, root_directory, create_folders) 
      VALUES (1, NULL, 'true') 
      ON CONFLICT (id) DO NOTHING;
    `);
  } catch (e) {
    // If insert fails, try without create_folders (for very old schemas)
    try {
      await pool.query(`
        INSERT INTO settings (id, root_directory) 
        VALUES (1, NULL) 
        ON CONFLICT (id) DO NOTHING;
      `);
      // Then update create_folders if column exists
      await pool.query(`
        UPDATE settings SET create_folders = 'true' WHERE id = 1 AND create_folders IS NULL;
      `);
    } catch (e2) {
      console.log(`Settings row might already exist:`, e2.message);
    }
  }
  await migrateLegacySmtpIntoNumberedSlots();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS map_floor_plans (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('Affordable', 'Superior')),
      size_sqm NUMERIC(10, 2) NOT NULL,
      image_filename TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await addMissingColumns(pool, "map_floor_plans", [
    "scale_line_x1",
    "scale_line_y1",
    "scale_line_x2",
    "scale_line_y2",
  ], "DOUBLE PRECISION");
  await addMissingColumns(pool, "map_floor_plans", ["scale_line_meters"], "NUMERIC(10, 3)");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS map_quote_items (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL DEFAULT '',
      checked BOOLEAN NOT NULL DEFAULT false,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await ensureProjectAccessTokens(pool);
  await ensureUserAccessPermissionsTable(pool);
  await ensureUserMessagesTable(pool);
  await markSchemaUpToDate(pool);
  console.log(`Schema ${SCHEMA_VERSION} applied`);
}

// List projects (?full=1 for all columns; default lite omits logs, notes, file paths)
app.get("/api/projects", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const useLite = req.query.full !== "1";
    const r = await pool.query(buildProjectsListQuery(useLite));
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get single project by opaque access_token in URL (numeric ids are rejected to prevent enumeration)
app.get("/api/projects/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });

  const routeParam = req.params.id;
  if (isLegacyNumericProjectId(routeParam)) {
    return res.status(404).json({ error: "not found" });
  }

  const id = await resolveProjectIdFromAccessToken(pool, routeParam);
  console.log(`GET /api/projects/:id - Requested token, resolved ID: ${id}`);

  if (!id) {
    return res.status(404).json({ error: "not found" });
  }

  try {
    const r = await pool.query(
      "SELECT id, access_token, name, status, suburb, street, state, client_name, email, phone, stream, year, deposit, project_cost, salesperson, proposal_pdf_location, site_visit_status, site_visit_date, site_visit_time, site_visit_notes, site_visit_scheduled_date, site_visit_scheduled_period, contract_status, contract_sent_date, contract_complete_date, supporting_documents_status, supporting_documents_sent_date, supporting_documents_complete_date, water_authority, water_declaration_status, water_declaration_sent_date, water_declaration_complete_date, notes, project_info_notes, specs, classification, project_log, window_status, window_colour, window_reveal, window_reveal_other, window_glazing, window_bal_rating, window_date_required, window_ordered_date, window_order_pdf_location, window_order_number, drawings_status, drawings_pdf_location, drawings_history, drawings_viewed_date, drawings_sent_to_client_date, drawings_holder_date, draftsperson, drawings_holder, drawing_manager_notes, colours_status, colours_notes, colours_pdf_location, colours_sent_date, colours_reminder_sent_date, roof_colour, cladding_colour, baseboards_colour, roof_style, planning_status, energy_report_status, footing_certification_status, building_permit_status, septic_permit, septic_notes, septic_email_sent_date, pic, number_of_robes, robe_widths, robe_plan_pdf_location, robe_colours_pdf_location, substatus, substatus_detail, on_hold, survey_status, soil_status, qp_number, planning_jf_planning_property_report, planning_jf_title, planning_jf_covenant, planning_jf_section_173_agreement, planning_jf_plan_of_subdivision, planning_jf_ebyda_stormwater, planning_jf_byda_sewer_main, planning_jf_internal_sewer_plan, planning_jf_sewer_main_size_depth_offset, planning_jf_legal_point_discharge, planning_jf_property_info_report, planning_jf_planning_property_report_requested_at, planning_jf_planning_property_report_received_at, planning_jf_title_requested_at, planning_jf_title_received_at, planning_jf_covenant_requested_at, planning_jf_covenant_received_at, planning_jf_section_173_agreement_requested_at, planning_jf_section_173_agreement_received_at, planning_jf_plan_of_subdivision_requested_at, planning_jf_plan_of_subdivision_received_at, planning_jf_ebyda_stormwater_requested_at, planning_jf_ebyda_stormwater_received_at, planning_jf_byda_sewer_main_requested_at, planning_jf_byda_sewer_main_received_at, planning_jf_internal_sewer_plan_requested_at, planning_jf_internal_sewer_plan_received_at, planning_jf_sewer_main_size_depth_offset_requested_at, planning_jf_sewer_main_size_depth_offset_received_at, planning_jf_legal_point_discharge_requested_at, planning_jf_legal_point_discharge_received_at, planning_jf_property_info_report_requested_at, planning_jf_property_info_report_received_at, planning_jf_planning_property_report_path, planning_jf_title_path, planning_jf_covenant_path, planning_jf_section_173_agreement_path, planning_jf_plan_of_subdivision_path, planning_jf_ebyda_stormwater_path, planning_jf_byda_sewer_main_path, planning_jf_internal_sewer_plan_path, planning_jf_sewer_main_size_depth_offset_path, planning_jf_legal_point_discharge_path, planning_jf_property_info_report_path, planning_jf_job_file_pdf_path, planning_written_advice, planning_written_advice_requested_at, planning_written_advice_received_at, planning_town_planning, planning_town_planning_requested_at, planning_town_planning_received_at, planning_land_flooding_regulation, planning_land_flooding_fpa_requested_at, planning_land_flooding_fpa_received_at, planning_land_flooding_cc_requested_at, planning_land_flooding_cc_received_at, planning_bal, planning_bal_requested_at, planning_bal_received_at, planning_footing_certification_requested_at, planning_footing_certification_received_at, planning_energy_report_requested_at, planning_energy_report_received_at, planning_energy_specs_added_to_plans, construction_payments_paid, duplicate_source_project_id, project_lat, project_lng, project_geocoded_at, updated_at, client1_name, client1_email, client1_phone, client1_active, client2_name, client2_email, client2_phone, client2_active, client3_name, client3_email, client3_phone, client3_active, client_notes FROM projects WHERE id = $1",
      [id]
    );
    
    console.log(`GET /api/projects/:id - Query returned ${r.rows.length} row(s)`);
    
    if (r.rows.length === 0) {
      return res.status(404).json({ error: "not found" });
    }

    const row = r.rows[0];
    const copiesR = await pool.query(
      `SELECT id FROM projects WHERE duplicate_source_project_id = $1 ORDER BY id ASC`,
      [id]
    );
    row.duplicate_linked_project_ids = copiesR.rows.map((x) => x.id);

    res.json(row);
  } catch (e) {
    console.error("Error in GET /api/projects/:id:", e);
    res.status(500).json({ error: e.message });
  }
});

// Update septic fields only (safe autosave path for Planning tab)
app.put("/api/projects/:id/septic", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  try {
    const body = req.body || {};
    const updates = [];
    const values = [];
    let idx = 1;

    if (Object.prototype.hasOwnProperty.call(body, "septic_permit")) {
      const v = body.septic_permit;
      updates.push(`septic_permit = $${idx++}`);
      values.push(v === "" ? null : v);
    }
    if (Object.prototype.hasOwnProperty.call(body, "septic_notes")) {
      const v = body.septic_notes;
      updates.push(`septic_notes = $${idx++}`);
      values.push(v === "" ? null : v);
    }
    if (Object.prototype.hasOwnProperty.call(body, "septic_email_sent_date")) {
      const v = body.septic_email_sent_date;
      updates.push(`septic_email_sent_date = $${idx++}`);
      values.push(v === "" ? null : v);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No septic fields provided" });
    }

    updates.push("updated_at = NOW()");
    values.push(id);

    const query = `
      UPDATE projects
      SET ${updates.join(", ")}
      WHERE id = $${idx}
      RETURNING id, septic_permit, septic_notes, septic_email_sent_date, updated_at
    `;

    const r = await pool.query(query, values);
    if (r.rowCount === 0) {
      return res.status(404).json({ error: "not found" });
    }

    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update construction payment stage checkboxes (paid / not paid only)
app.put("/api/projects/:id/construction-payments", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  try {
    const body = req.body || {};
    if (!Object.prototype.hasOwnProperty.call(body, "construction_payments_paid")) {
      return res.status(400).json({ error: "construction_payments_paid is required" });
    }

    const raw = body.construction_payments_paid;
    let stored = null;
    if (raw != null && raw !== "") {
      if (typeof raw === "string") {
        stored = raw;
      } else if (typeof raw === "object") {
        stored = JSON.stringify(raw);
      }
    }

    const r = await pool.query(
      `
      UPDATE projects
      SET construction_payments_paid = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, construction_payments_paid, updated_at
      `,
      [stored, id]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "not found" });
    }

    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Bulk create projects (for manual project addition)
app.post("/api/projects/bulk", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const { projects } = req.body || {};
    if (!Array.isArray(projects) || projects.length === 0) {
      return res.status(400).json({ error: "projects array required" });
    }

    const results = [];
    let addedCount = 0;
    let skippedCount = 0;

    for (const projectData of projects) {
      const { suburb: suburbRaw, street: streetRaw, specs, classification, project_cost, year, state, stream, status } = projectData;
      const suburb = suburbRaw ? normalizeAddressHyphensForFilesystem(String(suburbRaw).trim()) : "";
      const street = streetRaw ? normalizeAddressHyphensForFilesystem(String(streetRaw).trim()) : "";
      
      if (!suburb || !street) {
        results.push({ error: `Missing suburb or street for project`, data: projectData });
        skippedCount++;
        continue;
      }

      // Check if project already exists
      const checkResult = await pool.query(
        "SELECT id FROM projects WHERE UPPER(TRIM(suburb)) = $1 AND UPPER(TRIM(street)) = $2",
        [suburb.toUpperCase().trim(), street.toUpperCase().trim()]
      );

      if (checkResult.rows.length > 0) {
        results.push({ skipped: true, message: `${suburb} - ${street} already exists` });
        skippedCount++;
        continue;
      }

      // Create project name
      const name = `${suburb} - ${street}`;
      // Start date: always use today when creating a new project
      const projectDate = new Date().toISOString().split('T')[0];

      // Create initial project log entry
      const now = new Date();
      const dateTimeStr = now.toISOString().replace('T', ' ').substring(0, 19);
      const initialLogEntry = `${dateTimeStr} - Project Created`;

      // Insert project (matching the regular POST endpoint structure)
      const result = await pool.query(
        `INSERT INTO projects (name, status, suburb, street, state, stream, year, deposit, project_cost, salesperson, client_name, email, phone, client1_name, client1_email, client1_phone, client1_active, client2_active, client3_active, contract_status, supporting_documents_status, water_authority, water_declaration_status, planning_status, energy_report_status, footing_certification_status, building_permit_status, septic_permit, specs, classification, project_log, planning_jf_planning_property_report, planning_jf_title, planning_jf_covenant, planning_jf_section_173_agreement, planning_jf_plan_of_subdivision, planning_jf_ebyda_stormwater, planning_jf_byda_sewer_main, planning_jf_internal_sewer_plan, planning_jf_sewer_main_size_depth_offset, planning_jf_legal_point_discharge, planning_jf_property_info_report) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, 'Not Done', 'Not Done', 'Not Done', 'Not Done', 'Not Done', 'Not Done', 'Not Done', 'Not Done', 'Not Done', 'Not Done', 'Not Done') 
         RETURNING id, name`,
        [
          name.trim(),
          (status || "Design Phase").trim(),
          suburb || null,
          street || null,
          (state || "QLD").trim(),
          (stream || "SGF - QLD").trim(),
          projectDate,
          null, // deposit
          project_cost ? project_cost.trim() : null,
          null, // salesperson
          null, // client_name
          null, // email
          null, // phone
          null, // client1_name
          null, // client1_email
          null, // client1_phone
          'true',  // client1_active - default to checked (true)
          null,    // client2_active - default to unchecked (null)
          null,    // client3_active - default to unchecked (null)
          'Not Sent',  // contract_status - default to Not Sent
          'Not Sent',  // supporting_documents_status - default to Not Sent
          'Not Required',  // water_authority - default to Not Required
          'Not Sent',  // water_declaration_status - default to Not Sent
          'Not Selected',  // planning_status - default to Not Selected
          'Not Submitted',  // energy_report_status - default to Not Submitted
          'Not Submitted',  // footing_certification_status - default to Not Submitted
          'Not Submitted',  // building_permit_status - default to Not Submitted
          'Not Required',  // septic_permit - default for new jobs
          specs ? specs.trim() : null,
          classification ? classification.trim() : null,
          initialLogEntry, // project_log - initial entry
        ]
      );

      results.push({ added: true, id: result.rows[0].id, name: result.rows[0].name });
      addedCount++;
    }

    res.json({
      success: true,
      added: addedCount,
      skipped: skippedCount,
      total: projects.length,
      results: results,
    });
  } catch (e) {
    console.error("Error in POST /api/projects/bulk:", e);
    res.status(500).json({ error: e.message });
  }
});

// Create project
app.post("/api/projects", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    let { name, status, suburb, street, state, stream, deposit, project_cost, salesperson, client_name, email, phone, client1_name, client1_email, client1_phone, specs, classification, year, duplicate_source_project_id, duplicateSourceProjectId } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });
    name = normalizeAddressHyphensForFilesystem(String(name).trim());
    suburb = suburb ? normalizeAddressHyphensForFilesystem(String(suburb).trim()) : suburb;
    street = street ? normalizeAddressHyphensForFilesystem(String(street).trim()) : street;

    let duplicateSourceProjectIdVal = null;
    const dupRaw = duplicate_source_project_id ?? duplicateSourceProjectId;
    if (dupRaw != null && dupRaw !== "") {
      const n = Number(dupRaw);
      if (Number.isInteger(n) && n > 0) {
        const chk = await pool.query("SELECT id FROM projects WHERE id = $1", [n]);
        if (chk.rows.length > 0) duplicateSourceProjectIdVal = n;
      }
    }

    if (duplicateSourceProjectIdVal != null) {
      const existingCopy = await pool.query(
        `SELECT id FROM projects WHERE duplicate_source_project_id = $1 LIMIT 1`,
        [duplicateSourceProjectIdVal]
      );
      if (existingCopy.rows.length > 0) {
        return res.status(400).json({
          error: "This project already has a linked copy. Only one copy is allowed.",
        });
      }
      const srcRow = await pool.query(
        `SELECT duplicate_source_project_id FROM projects WHERE id = $1`,
        [duplicateSourceProjectIdVal]
      );
      if (
        srcRow.rows.length > 0 &&
        srcRow.rows[0].duplicate_source_project_id != null &&
        String(srcRow.rows[0].duplicate_source_project_id).trim() !== ""
      ) {
        return res.status(400).json({
          error:
            "Cannot duplicate from a job that is already a copy. Use the original renovation project.",
        });
      }
    }

    // Start date: always use today when creating a new project (sales table uses this for "this month")
    const projectDate = new Date().toISOString().split('T')[0];

    // Create initial project log entry
    const now = new Date();
    const dateTimeStr = now.toISOString().replace('T', ' ').substring(0, 19); // Format: YYYY-MM-DD HH:MM:SS
    const initialLogEntry = `${dateTimeStr} - Project Created`;

    // Set default drawings_holder to "design team" for new projects
    const holderDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    const r = await pool.query(
      `INSERT INTO projects (name, status, suburb, street, state, stream, year, deposit, project_cost, salesperson, client_name, email, phone, client1_name, client1_email, client1_phone, client1_active, client2_active, client3_active, contract_status, supporting_documents_status, water_authority, water_declaration_status, planning_status, energy_report_status, footing_certification_status, building_permit_status, septic_permit, specs, classification, project_log, drawings_holder, drawings_holder_date, duplicate_source_project_id, planning_jf_planning_property_report, planning_jf_title, planning_jf_covenant, planning_jf_section_173_agreement, planning_jf_plan_of_subdivision, planning_jf_ebyda_stormwater, planning_jf_byda_sewer_main, planning_jf_internal_sewer_plan, planning_jf_sewer_main_size_depth_offset, planning_jf_legal_point_discharge, planning_jf_property_info_report) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, 'Not Done', 'Not Done', 'Not Done', 'Not Done', 'Not Done', 'Not Done', 'Not Done', 'Not Done', 'Not Done', 'Not Done', 'Not Done') RETURNING *`,
      [
        name.trim(),
        (status || "Design Phase").trim(),
        suburb ? suburb.trim() : null,
        street ? street.trim() : null,
        state ? state.trim() : null,
        stream ? stream.trim() : null,
        projectDate,
        deposit ? deposit.trim() : null,
        project_cost ? project_cost.trim() : null,
        salesperson ? salesperson.trim() : null,
        client_name ? client_name.trim() : null,
        email ? email.trim() : null,
        phone ? phone.trim() : null,
        client1_name ? client1_name.trim() : null,
        client1_email ? client1_email.trim() : null,
        client1_phone ? client1_phone.trim() : null,
        'true',  // client1_active - default to checked (true)
        null,    // client2_active - default to unchecked (null)
        null,    // client3_active - default to unchecked (null)
        'Not Sent',  // contract_status - default to Not Sent
        'Not Sent',  // supporting_documents_status - default to Not Sent
        'Not Required',  // water_authority - default to Not Required
        'Not Sent',  // water_declaration_status - default to Not Sent
        'Not Selected',  // planning_status - default to Not Selected
        'Not Submitted',  // energy_report_status - default to Not Submitted
        'Not Submitted',  // footing_certification_status - default to Not Submitted
        'Not Submitted',  // building_permit_status - default to Not Submitted
        'Not Required',  // septic_permit - default for new jobs
        specs ? specs.trim() : null,  // specs
        classification ? classification.trim() : null,  // classification
        initialLogEntry,  // project_log - initial entry
        'design team',  // drawings_holder - default to "design team"
        holderDate,  // drawings_holder_date - set to today
        duplicateSourceProjectIdVal,
      ]
    );

    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update project
app.put("/api/projects/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const body = req.body || {};
  const isClearingDrawingData =
    Object.prototype.hasOwnProperty.call(body, "drawings_history") &&
    Object.prototype.hasOwnProperty.call(body, "drawings_pdf_location") &&
    Object.prototype.hasOwnProperty.call(body, "drawings_status") &&
    (body.drawings_history === "[]" ||
      (Array.isArray(body.drawings_history) && body.drawings_history.length === 0)) &&
    (body.drawings_pdf_location === null || body.drawings_pdf_location === "") &&
    body.drawings_status === "Not Assigned";

  if (isClearingDrawingData) {
    const isAdmin = await isAdminRequest(req);
    if (!isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }
  }

  try {
    // Normalize date field if provided: 'year' field stores the full DATE (YYYY-MM-DD format)
    // If only a year is provided, convert to full date. The year is ALWAYS derived from the date field.
    let normalizedYear = undefined;
    if (req.body.year !== undefined) {
      const yearValue = req.body.year;
      if (yearValue === null || yearValue === "") {
        normalizedYear = null;
      } else {
        const yearStr = yearValue.toString().trim();
        // If only year provided (e.g., "2024"), convert to full date (e.g., "2024-01-01")
        if (/^\d{4}$/.test(yearStr)) {
          normalizedYear = `${yearStr}-01-01`;
        } else if (yearStr.includes("/")) {
          // Handle MM/DD/YYYY or DD/MM/YYYY format
          const parts = yearStr.split("/");
          if (parts.length === 3) {
            const part1 = parts[0].trim();
            const part2 = parts[1].trim();
            const part3 = parts[2].trim();
            // If part1 > 12, assume DD/MM/YYYY, otherwise MM/DD/YYYY
            if (parseInt(part1) > 12 && parseInt(part2) <= 12) {
              normalizedYear = `${part3}-${part2.padStart(2, "0")}-${part1.padStart(2, "0")}`;
            } else {
              normalizedYear = `${part3}-${part1.padStart(2, "0")}-${part2.padStart(2, "0")}`;
            }
          } else {
            normalizedYear = yearStr; // Keep as is if can't parse
          }
        } else {
          normalizedYear = yearStr; // Already in YYYY-MM-DD or other format, keep as is
        }
      }
    }
    
    const { name, status, stream, suburb, street, state, year, deposit, project_cost, salesperson, client_name, email, phone,
      client1_name, client1_email, client1_phone, client1_active,
      client2_name, client2_email, client2_phone, client2_active,
      client3_name, client3_email, client3_phone, client3_active,
      client_notes,
      site_visit_status, site_visit_date, site_visit_time, site_visit_notes,
      contract_status, contract_sent_date, contract_complete_date,
      supporting_documents_status, supporting_documents_sent_date, supporting_documents_complete_date,
      water_authority, water_declaration_status, water_declaration_sent_date, water_declaration_complete_date,
      notes, project_info_notes, specs, classification,
      window_status, window_colour, window_reveal, window_reveal_other, window_glazing, window_bal_rating, window_date_required, window_ordered_date, window_order_pdf_location, window_order_number,
      drawings_status, drawings_pdf_location, drawings_history, drawings_viewed_date, drawings_sent_to_client_date, drawings_holder_date, draftsperson, drawings_holder, colours_status, colours_notes, colours_pdf_location, colours_sent_date, colours_reminder_sent_date, roof_colour, cladding_colour, baseboards_colour,       roof_style, planning_status, energy_report_status, footing_certification_status, building_permit_status, septic_permit, septic_notes, septic_email_sent_date, pic,
      number_of_robes, robe_widths, substatus, substatus_detail, on_hold, survey_status, soil_status, qp_number,
      planning_jf_planning_property_report, planning_jf_title, planning_jf_covenant, planning_jf_section_173_agreement, planning_jf_plan_of_subdivision, planning_jf_ebyda_stormwater, planning_jf_byda_sewer_main, planning_jf_internal_sewer_plan, planning_jf_sewer_main_size_depth_offset, planning_jf_legal_point_discharge, planning_jf_property_info_report,
      planning_jf_planning_property_report_requested_at, planning_jf_planning_property_report_received_at,
      planning_jf_title_requested_at, planning_jf_title_received_at, planning_jf_covenant_requested_at, planning_jf_covenant_received_at, planning_jf_section_173_agreement_requested_at, planning_jf_section_173_agreement_received_at, planning_jf_plan_of_subdivision_requested_at, planning_jf_plan_of_subdivision_received_at,
      planning_jf_ebyda_stormwater_requested_at, planning_jf_ebyda_stormwater_received_at,
      planning_jf_byda_sewer_main_requested_at, planning_jf_byda_sewer_main_received_at,
      planning_jf_internal_sewer_plan_requested_at, planning_jf_internal_sewer_plan_received_at,
      planning_jf_sewer_main_size_depth_offset_requested_at, planning_jf_sewer_main_size_depth_offset_received_at,
      planning_jf_legal_point_discharge_requested_at, planning_jf_legal_point_discharge_received_at,
      planning_jf_property_info_report_requested_at, planning_jf_property_info_report_received_at,
      planning_jf_planning_property_report_path, planning_jf_title_path, planning_jf_covenant_path, planning_jf_section_173_agreement_path, planning_jf_plan_of_subdivision_path, planning_jf_ebyda_stormwater_path, planning_jf_byda_sewer_main_path, planning_jf_internal_sewer_plan_path, planning_jf_sewer_main_size_depth_offset_path, planning_jf_legal_point_discharge_path,       planning_jf_property_info_report_path,
      planning_jf_job_file_pdf_path,
      planning_written_advice,
      planning_written_advice_requested_at,
      planning_written_advice_received_at,
      planning_town_planning,
      planning_town_planning_requested_at,
      planning_town_planning_received_at,
      planning_land_flooding_regulation,
      planning_land_flooding_fpa_requested_at,
      planning_land_flooding_fpa_received_at,
      planning_land_flooding_cc_requested_at,
      planning_land_flooding_cc_received_at,
      planning_bal,
      planning_bal_requested_at,
      planning_bal_received_at,
      planning_footing_certification_requested_at,
      planning_footing_certification_received_at,
      planning_energy_report_requested_at,
      planning_energy_report_received_at,
      planning_energy_specs_added_to_plans } = req.body || {};
    // Convert empty strings to null; stringify numbers for DB text columns.
    const processValue = (val) => {
      if (val === undefined) return null;
      if (typeof val === "number") {
        if (!Number.isFinite(val)) return null;
        return String(val);
      }
      if (typeof val === "string") {
        const trimmed = val.trim();
        return trimmed === "" ? null : trimmed;
      }
      return null;
    };
    const processAddressText = (val) => {
      const v = processValue(val);
      return v === null ? null : normalizeAddressHyphensForFilesystem(v);
    };
    /** `draftsperson` is never NULL in DB — empty/clear maps to sentinel. */
    const processDraftsperson = (val) => {
      if (val === undefined) return null;
      if (val === null) return DRAFTSPERSON_UNASSIGNED;
      if (typeof val === "number") {
        if (!Number.isFinite(val)) return DRAFTSPERSON_UNASSIGNED;
        const t = String(val).trim();
        return t === "" ? DRAFTSPERSON_UNASSIGNED : t;
      }
      if (typeof val === "string") {
        const t = val.trim();
        return t === "" ? DRAFTSPERSON_UNASSIGNED : t;
      }
      return DRAFTSPERSON_UNASSIGNED;
    };
    /** Planning job-file doc columns are NOT NULL in DB; undefined = skip update; anything empty/invalid → "Not Done". */
    const processPlanningJfDoc = (val) => {
      if (val === undefined) return null;
      if (val === null) return "Not Done";
      if (typeof val === "string") {
        const trimmed = val.trim();
        return trimmed === "" ? "Not Done" : trimmed;
      }
      return "Not Done";
    };
    /** Optional ISO date (YYYY-MM-DD) for planning job-file docs; undefined = skip; null/"" = clear. */
    const processJfDocDate = (val) => {
      if (val === undefined) return "__SKIP__";
      if (val === null) return null;
      if (typeof val === "string") {
        const t = val.trim();
        return t === "" ? null : t;
      }
      return null;
    };
    /** Full disk path for planning JF uploads / merged PDF; undefined = skip update; null or "" = clear column (COALESCE cannot clear). */
    const processPlanningJfPath = (val) => {
      if (val === undefined) return "__SKIP__";
      if (val === null) return null;
      if (typeof val === "string") {
        const t = val.trim();
        return t === "" ? null : t;
      }
      return null;
    };
    /** Written planning advice: N/A | Required; undefined = skip (COALESCE); null = skip. */
    const processWrittenAdvice = (val) => {
      if (val === undefined || val === null) return null;
      if (typeof val === "string" && val.trim() === "Required") return "Required";
      return "N/A";
    };
    /** Land subject to flooding: N/A | REG 153 | REG 154 | REG 153 & REG 154; undefined = skip COALESCE. */
    const processLandFloodingRegulation = (val) => {
      if (val === undefined || val === null) return null;
      if (typeof val !== "string") return "N/A";
      const t = val.trim();
      const allowed = new Set(["N/A", "REG 153", "REG 154", "REG 153 & REG 154"]);
      return allowed.has(t) ? t : "N/A";
    };
    /** Energy specs added to plans: Not Completed | Completed; undefined = skip COALESCE. */
    const processEnergySpecsAddedToPlans = (val) => {
      if (val === undefined || val === null) return null;
      if (typeof val === "string" && val.trim() === "Completed") return "Completed";
      return "Not Completed";
    };
    /**
     * If the client sends a doc status in this PUT, the stored file path must match that status:
     * anything other than "Received" clears the path (handles partial bodies that omit path keys).
     */
    const effectiveJfDocPath = (statusRaw, pathRaw) => {
      if (statusRaw !== undefined) {
        const resolved = processPlanningJfDoc(statusRaw);
        if (resolved !== "Received") return null;
      }
      return processPlanningJfPath(pathRaw);
    };
    // Process boolean/checkbox values: 
    // For "not provided" (undefined), return special sentinel '__SKIP__'
    // For "provided as true", return 'true'
    // For "provided as false/null", return '__NULL__' to explicitly set to null
    const processBoolean = (val) => {
      if (val === undefined) return '__SKIP__'; // Don't update this field
      if (val === true || val === 'true' || val === 'Y' || val === 'y') return 'true';
      return '__NULL__'; // Explicitly set to null (unchecked)
    };
    
    const client1ActiveValue = processBoolean(client1_active);
    const client2ActiveValue = processBoolean(client2_active);
    const client3ActiveValue = processBoolean(client3_active);
    const onHoldValue = processBoolean(on_hold);
    
    console.log("Client active values:", {
      client1: client1ActiveValue,
      client2: client2ActiveValue,
      client3: client3ActiveValue,
      on_hold: onHoldValue,
    });
    
    // Build the SQL query - use CASE to handle boolean fields properly
    // For active fields: if provided is true, use the value (even if null to uncheck), otherwise keep existing
    // We need to distinguish between "not provided" (undefined) and "provided as null" (unchecked)
    // Using a CASE statement that checks a separate parameter indicating if value was provided
    const r = await pool.query(
      `
      UPDATE projects
      SET
        name = COALESCE($1, name),
        status = COALESCE($2, status),
        stream = COALESCE($3, stream),
        suburb = COALESCE($4, suburb),
        street = COALESCE($5, street),
        state = COALESCE($6, state),
        deposit = COALESCE($7, deposit),
        project_cost = COALESCE($8, project_cost),
        client_name = COALESCE($9, client_name),
        email = COALESCE($10, email),
        phone = COALESCE($11, phone),
        client1_name = COALESCE($12, client1_name),
        client1_email = COALESCE($13, client1_email),
        client1_phone = COALESCE($14, client1_phone),
        client1_active = CASE WHEN $15 = '__SKIP__' THEN client1_active WHEN $15 = '__NULL__' THEN NULL ELSE $15 END,
        client2_name = COALESCE($16, client2_name),
        client2_email = COALESCE($17, client2_email),
        client2_phone = COALESCE($18, client2_phone),
        client2_active = CASE WHEN $19 = '__SKIP__' THEN client2_active WHEN $19 = '__NULL__' THEN NULL ELSE $19 END,
        client3_name = COALESCE($20, client3_name),
        client3_email = COALESCE($21, client3_email),
        client3_phone = COALESCE($22, client3_phone),
        client3_active = CASE WHEN $23 = '__SKIP__' THEN client3_active WHEN $23 = '__NULL__' THEN NULL ELSE $23 END,
        client_notes = COALESCE($24, client_notes),
        site_visit_status = COALESCE($25, site_visit_status),
        site_visit_date = CASE WHEN $28 = '__CLEAR__' THEN NULL ELSE COALESCE($26, site_visit_date) END,
        site_visit_time = CASE WHEN $29 = '__CLEAR__' THEN NULL ELSE COALESCE($27, site_visit_time) END,
        site_visit_notes = COALESCE($30, site_visit_notes),
        contract_status = COALESCE($31, contract_status),
        contract_sent_date = COALESCE($32, contract_sent_date),
        contract_complete_date = COALESCE($33, contract_complete_date),
        supporting_documents_status = COALESCE($34, supporting_documents_status),
        supporting_documents_sent_date = COALESCE($35, supporting_documents_sent_date),
        supporting_documents_complete_date = COALESCE($36, supporting_documents_complete_date),
        water_authority = COALESCE($37, water_authority),
        water_declaration_status = COALESCE($38, water_declaration_status),
        water_declaration_sent_date = COALESCE($39, water_declaration_sent_date),
        water_declaration_complete_date = COALESCE($40, water_declaration_complete_date),
        notes = COALESCE($41, notes),
        window_status = COALESCE($42, window_status),
        window_colour = COALESCE($43, window_colour),
        window_reveal = COALESCE($44, window_reveal),
        window_reveal_other = COALESCE($45, window_reveal_other),
        window_glazing = COALESCE($46, window_glazing),
        window_bal_rating = COALESCE($47, window_bal_rating),
        window_date_required = COALESCE($48, window_date_required),
        window_ordered_date = COALESCE($49, window_ordered_date),
        window_order_pdf_location = COALESCE($50, window_order_pdf_location),
        window_order_number = COALESCE($51, window_order_number),
        drawings_status = COALESCE($52, drawings_status),
        drawings_pdf_location = COALESCE($53, drawings_pdf_location),
        drawings_history = COALESCE($54, drawings_history),
        drawings_viewed_date = COALESCE($55, drawings_viewed_date),
        drawings_sent_to_client_date = COALESCE($56, drawings_sent_to_client_date),
        drawings_holder_date = COALESCE($57, drawings_holder_date),
        draftsperson = COALESCE($58, draftsperson),
        drawings_holder = COALESCE($59, drawings_holder),
        colours_status = COALESCE($60, colours_status),
        colours_notes = COALESCE($61, colours_notes),
        colours_pdf_location = COALESCE($62, colours_pdf_location),
        colours_sent_date = COALESCE($63, colours_sent_date),
        colours_reminder_sent_date = COALESCE($64, colours_reminder_sent_date),
        roof_colour = COALESCE($65, roof_colour),
        cladding_colour = COALESCE($66, cladding_colour),
        baseboards_colour = COALESCE($67, baseboards_colour),
        roof_style = COALESCE($68, roof_style),
        planning_status = COALESCE($69, planning_status),
        energy_report_status = COALESCE($70, energy_report_status),
        footing_certification_status = COALESCE($71, footing_certification_status),
        building_permit_status = COALESCE($72, building_permit_status),
        septic_permit = COALESCE($73, septic_permit),
        septic_notes = COALESCE($74, septic_notes),
        septic_email_sent_date = COALESCE($75, septic_email_sent_date),
        pic = COALESCE($76, pic),
        year = COALESCE($77, year),
        project_info_notes = COALESCE($78, project_info_notes),
        specs = COALESCE($79, specs),
        classification = COALESCE($80, classification),
        number_of_robes = COALESCE($81, number_of_robes),
        robe_widths = COALESCE($82, robe_widths),
        substatus = COALESCE($83, substatus),
        substatus_detail = COALESCE($84, substatus_detail),
        on_hold = CASE WHEN $85 = '__SKIP__' THEN on_hold WHEN $85 = '__NULL__' THEN NULL ELSE $85 END,
        survey_status = COALESCE($86, survey_status),
        soil_status = COALESCE($87, soil_status),
        qp_number = COALESCE($88, qp_number),
        planning_jf_planning_property_report = COALESCE($89, planning_jf_planning_property_report),
        planning_jf_title = COALESCE($90, planning_jf_title),
        planning_jf_covenant = COALESCE($91, planning_jf_covenant),
        planning_jf_section_173_agreement = COALESCE($92, planning_jf_section_173_agreement),
        planning_jf_plan_of_subdivision = COALESCE($93, planning_jf_plan_of_subdivision),
        planning_jf_ebyda_stormwater = COALESCE($94, planning_jf_ebyda_stormwater),
        planning_jf_byda_sewer_main = COALESCE($95, planning_jf_byda_sewer_main),
        planning_jf_internal_sewer_plan = COALESCE($96, planning_jf_internal_sewer_plan),
        planning_jf_sewer_main_size_depth_offset = COALESCE($97, planning_jf_sewer_main_size_depth_offset),
        planning_jf_legal_point_discharge = COALESCE($98, planning_jf_legal_point_discharge),
        planning_jf_property_info_report = COALESCE($99, planning_jf_property_info_report),
        planning_jf_planning_property_report_requested_at = CASE $100 WHEN '__SKIP__' THEN planning_jf_planning_property_report_requested_at ELSE $100 END,
        planning_jf_planning_property_report_received_at = CASE $101 WHEN '__SKIP__' THEN planning_jf_planning_property_report_received_at ELSE $101 END,
        planning_jf_title_requested_at = CASE $102 WHEN '__SKIP__' THEN planning_jf_title_requested_at ELSE $102 END,
        planning_jf_title_received_at = CASE $103 WHEN '__SKIP__' THEN planning_jf_title_received_at ELSE $103 END,
        planning_jf_covenant_requested_at = CASE $104 WHEN '__SKIP__' THEN planning_jf_covenant_requested_at ELSE $104 END,
        planning_jf_covenant_received_at = CASE $105 WHEN '__SKIP__' THEN planning_jf_covenant_received_at ELSE $105 END,
        planning_jf_section_173_agreement_requested_at = CASE $106 WHEN '__SKIP__' THEN planning_jf_section_173_agreement_requested_at ELSE $106 END,
        planning_jf_section_173_agreement_received_at = CASE $107 WHEN '__SKIP__' THEN planning_jf_section_173_agreement_received_at ELSE $107 END,
        planning_jf_plan_of_subdivision_requested_at = CASE $108 WHEN '__SKIP__' THEN planning_jf_plan_of_subdivision_requested_at ELSE $108 END,
        planning_jf_plan_of_subdivision_received_at = CASE $109 WHEN '__SKIP__' THEN planning_jf_plan_of_subdivision_received_at ELSE $109 END,
        planning_jf_ebyda_stormwater_requested_at = CASE $110 WHEN '__SKIP__' THEN planning_jf_ebyda_stormwater_requested_at ELSE $110 END,
        planning_jf_ebyda_stormwater_received_at = CASE $111 WHEN '__SKIP__' THEN planning_jf_ebyda_stormwater_received_at ELSE $111 END,
        planning_jf_byda_sewer_main_requested_at = CASE $112 WHEN '__SKIP__' THEN planning_jf_byda_sewer_main_requested_at ELSE $112 END,
        planning_jf_byda_sewer_main_received_at = CASE $113 WHEN '__SKIP__' THEN planning_jf_byda_sewer_main_received_at ELSE $113 END,
        planning_jf_internal_sewer_plan_requested_at = CASE $114 WHEN '__SKIP__' THEN planning_jf_internal_sewer_plan_requested_at ELSE $114 END,
        planning_jf_internal_sewer_plan_received_at = CASE $115 WHEN '__SKIP__' THEN planning_jf_internal_sewer_plan_received_at ELSE $115 END,
        planning_jf_sewer_main_size_depth_offset_requested_at = CASE $116 WHEN '__SKIP__' THEN planning_jf_sewer_main_size_depth_offset_requested_at ELSE $116 END,
        planning_jf_sewer_main_size_depth_offset_received_at = CASE $117 WHEN '__SKIP__' THEN planning_jf_sewer_main_size_depth_offset_received_at ELSE $117 END,
        planning_jf_legal_point_discharge_requested_at = CASE $118 WHEN '__SKIP__' THEN planning_jf_legal_point_discharge_requested_at ELSE $118 END,
        planning_jf_legal_point_discharge_received_at = CASE $119 WHEN '__SKIP__' THEN planning_jf_legal_point_discharge_received_at ELSE $119 END,
        planning_jf_property_info_report_requested_at = CASE $120 WHEN '__SKIP__' THEN planning_jf_property_info_report_requested_at ELSE $120 END,
        planning_jf_property_info_report_received_at = CASE $121 WHEN '__SKIP__' THEN planning_jf_property_info_report_received_at ELSE $121 END,
        planning_jf_planning_property_report_path = CASE WHEN $122::text = '__SKIP__' THEN planning_jf_planning_property_report_path ELSE $122 END,
        planning_jf_title_path = CASE WHEN $123::text = '__SKIP__' THEN planning_jf_title_path ELSE $123 END,
        planning_jf_covenant_path = CASE WHEN $124::text = '__SKIP__' THEN planning_jf_covenant_path ELSE $124 END,
        planning_jf_section_173_agreement_path = CASE WHEN $125::text = '__SKIP__' THEN planning_jf_section_173_agreement_path ELSE $125 END,
        planning_jf_plan_of_subdivision_path = CASE WHEN $126::text = '__SKIP__' THEN planning_jf_plan_of_subdivision_path ELSE $126 END,
        planning_jf_ebyda_stormwater_path = CASE WHEN $127::text = '__SKIP__' THEN planning_jf_ebyda_stormwater_path ELSE $127 END,
        planning_jf_byda_sewer_main_path = CASE WHEN $128::text = '__SKIP__' THEN planning_jf_byda_sewer_main_path ELSE $128 END,
        planning_jf_internal_sewer_plan_path = CASE WHEN $129::text = '__SKIP__' THEN planning_jf_internal_sewer_plan_path ELSE $129 END,
        planning_jf_sewer_main_size_depth_offset_path = CASE WHEN $130::text = '__SKIP__' THEN planning_jf_sewer_main_size_depth_offset_path ELSE $130 END,
        planning_jf_legal_point_discharge_path = CASE WHEN $131::text = '__SKIP__' THEN planning_jf_legal_point_discharge_path ELSE $131 END,
        planning_jf_property_info_report_path = CASE WHEN $132::text = '__SKIP__' THEN planning_jf_property_info_report_path ELSE $132 END,
        planning_jf_job_file_pdf_path = CASE WHEN $133::text = '__SKIP__' THEN planning_jf_job_file_pdf_path ELSE $133 END,
        planning_written_advice = COALESCE($134, planning_written_advice),
        planning_written_advice_requested_at = CASE $135 WHEN '__SKIP__' THEN planning_written_advice_requested_at ELSE $135 END,
        planning_written_advice_received_at = CASE $136 WHEN '__SKIP__' THEN planning_written_advice_received_at ELSE $136 END,
        planning_town_planning = COALESCE($137, planning_town_planning),
        planning_town_planning_requested_at = CASE $138 WHEN '__SKIP__' THEN planning_town_planning_requested_at ELSE $138 END,
        planning_town_planning_received_at = CASE $139 WHEN '__SKIP__' THEN planning_town_planning_received_at ELSE $139 END,
        planning_land_flooding_regulation = COALESCE($140, planning_land_flooding_regulation),
        planning_land_flooding_fpa_requested_at = CASE $141 WHEN '__SKIP__' THEN planning_land_flooding_fpa_requested_at ELSE $141 END,
        planning_land_flooding_fpa_received_at = CASE $142 WHEN '__SKIP__' THEN planning_land_flooding_fpa_received_at ELSE $142 END,
        planning_land_flooding_cc_requested_at = CASE $143 WHEN '__SKIP__' THEN planning_land_flooding_cc_requested_at ELSE $143 END,
        planning_land_flooding_cc_received_at = CASE $144 WHEN '__SKIP__' THEN planning_land_flooding_cc_received_at ELSE $144 END,
        planning_bal = COALESCE($145, planning_bal),
        planning_bal_requested_at = CASE $146 WHEN '__SKIP__' THEN planning_bal_requested_at ELSE $146 END,
        planning_bal_received_at = CASE $147 WHEN '__SKIP__' THEN planning_bal_received_at ELSE $147 END,
        planning_footing_certification_requested_at = CASE $148 WHEN '__SKIP__' THEN planning_footing_certification_requested_at ELSE $148 END,
        planning_footing_certification_received_at = CASE $149 WHEN '__SKIP__' THEN planning_footing_certification_received_at ELSE $149 END,
        planning_energy_report_requested_at = CASE $150 WHEN '__SKIP__' THEN planning_energy_report_requested_at ELSE $150 END,
        planning_energy_report_received_at = CASE $151 WHEN '__SKIP__' THEN planning_energy_report_received_at ELSE $151 END,
        planning_energy_specs_added_to_plans = COALESCE($152, planning_energy_specs_added_to_plans),
        salesperson = COALESCE($153, salesperson),
        updated_at = NOW()
      WHERE id = $154
      RETURNING *
      `,
      [
        processAddressText(name),
        processValue(status),
        processValue(stream),
        processAddressText(suburb),
        processAddressText(street),
        processValue(state),
        processValue(deposit),
        processValue(project_cost),
        processValue(client_name),
        processValue(email),
        processValue(phone),
        processValue(client1_name),
        processValue(client1_email),
        processValue(client1_phone),
        client1ActiveValue, // 'NOT_PROVIDED', 'true', or null
        processValue(client2_name),
        processValue(client2_email),
        processValue(client2_phone),
        client2ActiveValue, // 'NOT_PROVIDED', 'true', or null
        processValue(client3_name),
        processValue(client3_email),
        processValue(client3_phone),
        client3ActiveValue, // 'NOT_PROVIDED', 'true', or null
        processValue(client_notes),
        processValue(site_visit_status),
        processValue(site_visit_date),
        processValue(site_visit_time),
        // Sentinel values to indicate we want to clear these fields (when explicitly set to empty string)
        (site_visit_date === "" || site_visit_date === null) && site_visit_date !== undefined ? "__CLEAR__" : null,
        (site_visit_time === "" || site_visit_time === null) && site_visit_time !== undefined ? "__CLEAR__" : null,
        processValue(site_visit_notes),
        processValue(contract_status),
        processValue(contract_sent_date),
        processValue(contract_complete_date),
        processValue(supporting_documents_status),
        processValue(supporting_documents_sent_date),
        processValue(supporting_documents_complete_date),
        processValue(water_authority),
        processValue(water_declaration_status),
        processValue(water_declaration_sent_date),
        processValue(water_declaration_complete_date),
        processValue(notes),
        processValue(window_status),
        processValue(window_colour),
        processValue(window_reveal),
        processValue(window_reveal_other),
        processValue(window_glazing),
        processValue(window_bal_rating),
        processValue(window_date_required),
        processValue(window_ordered_date),
        processValue(window_order_pdf_location),
        processValue(window_order_number),
        processValue(drawings_status),
        processValue(drawings_pdf_location),
        processValue(drawings_history),
        processValue(drawings_viewed_date),
        processValue(drawings_sent_to_client_date),
        processValue(drawings_holder_date),
        processDraftsperson(draftsperson),
        processValue(drawings_holder),
        processValue(colours_status),
        processValue(colours_notes),
        processValue(colours_pdf_location),
        processValue(colours_sent_date),
        processValue(colours_reminder_sent_date),
        processValue(roof_colour),
        processValue(cladding_colour),
        processValue(baseboards_colour),
        processValue(roof_style),
        processValue(planning_status),
        processValue(energy_report_status),
        processValue(footing_certification_status),
        processValue(building_permit_status),
        processValue(septic_permit),
        processValue(septic_notes),
        processValue(septic_email_sent_date),
        processValue(pic),
        normalizedYear !== undefined ? (normalizedYear === null ? null : normalizedYear) : processValue(year),
        processValue(project_info_notes),
        processValue(specs),
        processValue(classification),
        processValue(number_of_robes),
        processValue(robe_widths),
        processValue(substatus),
        processValue(substatus_detail),
        onHoldValue,
        processValue(survey_status),
        processValue(soil_status),
        processValue(qp_number),
        processPlanningJfDoc(planning_jf_planning_property_report),
        processPlanningJfDoc(planning_jf_title),
        processPlanningJfDoc(planning_jf_covenant),
        processPlanningJfDoc(planning_jf_section_173_agreement),
        processPlanningJfDoc(planning_jf_plan_of_subdivision),
        processPlanningJfDoc(planning_jf_ebyda_stormwater),
        processPlanningJfDoc(planning_jf_byda_sewer_main),
        processPlanningJfDoc(planning_jf_internal_sewer_plan),
        processPlanningJfDoc(planning_jf_sewer_main_size_depth_offset),
        processPlanningJfDoc(planning_jf_legal_point_discharge),
        processPlanningJfDoc(planning_jf_property_info_report),
        processJfDocDate(planning_jf_planning_property_report_requested_at),
        processJfDocDate(planning_jf_planning_property_report_received_at),
        processJfDocDate(planning_jf_title_requested_at),
        processJfDocDate(planning_jf_title_received_at),
        processJfDocDate(planning_jf_covenant_requested_at),
        processJfDocDate(planning_jf_covenant_received_at),
        processJfDocDate(planning_jf_section_173_agreement_requested_at),
        processJfDocDate(planning_jf_section_173_agreement_received_at),
        processJfDocDate(planning_jf_plan_of_subdivision_requested_at),
        processJfDocDate(planning_jf_plan_of_subdivision_received_at),
        processJfDocDate(planning_jf_ebyda_stormwater_requested_at),
        processJfDocDate(planning_jf_ebyda_stormwater_received_at),
        processJfDocDate(planning_jf_byda_sewer_main_requested_at),
        processJfDocDate(planning_jf_byda_sewer_main_received_at),
        processJfDocDate(planning_jf_internal_sewer_plan_requested_at),
        processJfDocDate(planning_jf_internal_sewer_plan_received_at),
        processJfDocDate(planning_jf_sewer_main_size_depth_offset_requested_at),
        processJfDocDate(planning_jf_sewer_main_size_depth_offset_received_at),
        processJfDocDate(planning_jf_legal_point_discharge_requested_at),
        processJfDocDate(planning_jf_legal_point_discharge_received_at),
        processJfDocDate(planning_jf_property_info_report_requested_at),
        processJfDocDate(planning_jf_property_info_report_received_at),
        effectiveJfDocPath(planning_jf_planning_property_report, planning_jf_planning_property_report_path),
        effectiveJfDocPath(planning_jf_title, planning_jf_title_path),
        effectiveJfDocPath(planning_jf_covenant, planning_jf_covenant_path),
        effectiveJfDocPath(planning_jf_section_173_agreement, planning_jf_section_173_agreement_path),
        effectiveJfDocPath(planning_jf_plan_of_subdivision, planning_jf_plan_of_subdivision_path),
        effectiveJfDocPath(planning_jf_ebyda_stormwater, planning_jf_ebyda_stormwater_path),
        effectiveJfDocPath(planning_jf_byda_sewer_main, planning_jf_byda_sewer_main_path),
        effectiveJfDocPath(planning_jf_internal_sewer_plan, planning_jf_internal_sewer_plan_path),
        effectiveJfDocPath(planning_jf_sewer_main_size_depth_offset, planning_jf_sewer_main_size_depth_offset_path),
        effectiveJfDocPath(planning_jf_legal_point_discharge, planning_jf_legal_point_discharge_path),
        effectiveJfDocPath(planning_jf_property_info_report, planning_jf_property_info_report_path),
        processPlanningJfPath(planning_jf_job_file_pdf_path),
        processWrittenAdvice(planning_written_advice),
        processJfDocDate(planning_written_advice_requested_at),
        processJfDocDate(planning_written_advice_received_at),
        processWrittenAdvice(planning_town_planning),
        processJfDocDate(planning_town_planning_requested_at),
        processJfDocDate(planning_town_planning_received_at),
        processLandFloodingRegulation(planning_land_flooding_regulation),
        processJfDocDate(planning_land_flooding_fpa_requested_at),
        processJfDocDate(planning_land_flooding_fpa_received_at),
        processJfDocDate(planning_land_flooding_cc_requested_at),
        processJfDocDate(planning_land_flooding_cc_received_at),
        processWrittenAdvice(planning_bal),
        processJfDocDate(planning_bal_requested_at),
        processJfDocDate(planning_bal_received_at),
        processJfDocDate(planning_footing_certification_requested_at),
        processJfDocDate(planning_footing_certification_received_at),
        processJfDocDate(planning_energy_report_requested_at),
        processJfDocDate(planning_energy_report_received_at),
        processEnergySpecsAddedToPlans(planning_energy_specs_added_to_plans),
        processValue(salesperson),
        id
      ]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "not found" });
    }

    console.log("Update successful. Row count:", r.rowCount);
    res.json(r.rows[0]);
  } catch (e) {
    console.error("Update query error:", e.message);
    console.error("Stack:", e.stack);
    res.status(500).json({ error: e.message });
  }
});

// --- Project geocoding cache (Nominatim) ---
let lastNominatimRequestAtMs = 0;
async function throttleNominatim() {
  const minGapMs = 1150;
  const now = Date.now();
  const wait = Math.max(0, lastNominatimRequestAtMs + minGapMs - now);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatimRequestAtMs = Date.now();
}

async function geocodeWithNominatim(q) {
  const query = String(q || "").trim();
  if (!query) return null;
  await throttleNominatim();
  const params = new URLSearchParams({ q: query, format: "json", limit: "1" });
  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "SGF-Central/1.0 (maps geocoding cache)",
    },
  });
  if (!resp.ok) return null;
  const data = await resp.json().catch(() => []);
  if (!Array.isArray(data) || data.length === 0) return null;
  const hit = data[0];
  const lat = Number.parseFloat(hit.lat);
  const lng = Number.parseFloat(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, display_name: hit.display_name || "" };
}

// --- Cadastral parcel / property boundary lookup (Maps page) ---
// VIC: Vicmap Parcel via mapsParcelLookup.js. QLD: TODO.

async function handlePropertyBoundaryRequest(req, res) {
  const isAdmin = await isAdminRequest(req);
  if (!isAdmin) {
    return res.status(403).json({ ok: false, error: "Admin access required" });
  }

  const parsed = parseParcelLatLng(req.query);
  if (parsed.error) {
    return res.status(400).json({ ok: false, error: parsed.error });
  }
  const { lat, lng } = parsed;
  const state = normalizeParcelState(req.query.state);
  const address =
    req.query.address != null ? String(req.query.address).trim() : "";

  try {
    const result = await lookupParcelBoundary({ state, lat, lng, address });

    if (result.error) {
      return res.status(result.status || 400).json({
        ok: false,
        error: result.error,
        state,
      });
    }

    if (result.notFound || !result.hit) {
      const log = result.log || {};
      const timedOut =
        log.vicmapUnavailable === true ||
        String(log.lastApiError || "").toLowerCase().includes("timed out") ||
        String(log.lastApiError || "").includes("budget_exceeded");
      return res.status(timedOut ? 504 : 404).json({
        ok: false,
        error: timedOut
          ? "Cadastre lookup timed out — try again. The pin is still shown."
          : "Title boundary not available.",
        state,
        containsPin: false,
        approximate: false,
        timedOut,
      });
    }

    return res.json(formatPropertyBoundaryResponse(result.hit));
  } catch (e) {
    console.error("[property-boundary] lookup error:", e);
    return res.status(502).json({
      ok: false,
      error: e.message || "Cadastre service unavailable",
      state,
    });
  }
}

app.get("/api/property-boundary", handlePropertyBoundaryRequest);
app.get("/api/maps/parcel", handlePropertyBoundaryRequest);

// --- Victorian planning scheme info (Vicmap Planning FeatureServer) ---
async function handlePlanningInfoRequest(req, res) {
  const isAdmin = await isAdminRequest(req);
  if (!isAdmin) {
    return res.status(403).json({ ok: false, error: "Admin access required" });
  }

  const parsed = parsePlanningLatLng(req.query);
  if (parsed.error) {
    return res.status(400).json({ ok: false, error: parsed.error });
  }
  const { lat, lng } = parsed;
  const state = normalizePlanningState(req.query.state);

  const envelopeParsed = parseEnvelope(req.query);
  if (envelopeParsed?.error) {
    return res.status(400).json({ ok: false, error: envelopeParsed.error });
  }
  const envelope = typeof envelopeParsed === "string" ? envelopeParsed : null;

  try {
    const result = await lookupPlanningInfo({ state, lat, lng, envelope });

    if (result.error) {
      return res.status(result.status || 400).json({
        ok: false,
        error: result.error,
        state,
      });
    }

    if (!result.hit) {
      return res.status(404).json({
        ok: false,
        error: "Planning information not available.",
        state,
      });
    }

    return res.json(formatPlanningInfoResponse(result.hit));
  } catch (e) {
    console.error("[planning-info] lookup error:", e);
    return res.status(502).json({
      ok: false,
      error: e.message || "Planning service unavailable",
      state,
    });
  }
}

app.get("/api/planning-info", handlePlanningInfoRequest);

// --- Victorian property easements (Vicmap Property Easements FeatureServer) ---
async function handlePropertyEasementsRequest(req, res) {
  const isAdmin = await isAdminRequest(req);
  if (!isAdmin) {
    return res.status(403).json({ ok: false, error: "Admin access required" });
  }

  const input =
    req.method === "POST" && req.body && typeof req.body === "object" ? req.body : req.query;

  const parsed = parseEasementsLatLng(input);
  if (parsed.error) {
    return res.status(400).json({ ok: false, error: parsed.error });
  }
  const { lat, lng } = parsed;
  const state = normalizeEasementsState(input.state);

  const envelopeParsed = parseEasementsEnvelope(input);
  if (envelopeParsed?.error) {
    return res.status(400).json({ ok: false, error: envelopeParsed.error });
  }
  const envelope = typeof envelopeParsed === "string" ? envelopeParsed : null;

  const boundaryParsed = normalizeBoundaryInput(input.boundary ?? input.boundaryGeometry);
  if (boundaryParsed?.error) {
    return res.status(400).json({ ok: false, error: boundaryParsed.error });
  }
  const boundaryGeometry =
    boundaryParsed && typeof boundaryParsed === "object" && boundaryParsed.type
      ? boundaryParsed
      : null;

  const parcelId =
    input.parcelId != null ? String(input.parcelId).trim() || null : null;

  try {
    const result = await lookupPropertyEasements({
      state,
      lat,
      lng,
      envelope,
      boundaryGeometry,
      parcelId,
    });

    if (result.error) {
      return res.status(result.status || 400).json({
        ok: false,
        error: result.error,
        state,
      });
    }

    return res.json(formatPropertyEasementsResponse(result.hit));
  } catch (e) {
    console.error("[property-easements] lookup error:", e);
    return res.status(502).json({
      ok: false,
      error: e.message || "Easements service unavailable",
      state,
    });
  }
}

app.get("/api/property-easements", handlePropertyEasementsRequest);
app.post("/api/property-easements", handlePropertyEasementsRequest);

// --- Victorian AHD elevation at points (Vicmap Elevation FeatureServer) ---
app.post("/api/maps/elevation-ahd", async (req, res) => {
  const isAdmin = await isAdminRequest(req);
  if (!isAdmin) {
    return res.status(403).json({ ok: false, error: "Admin access required" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const parsedPoints = parsePointsInput(body.points);
  if (parsedPoints.error) {
    return res.status(400).json({ ok: false, error: parsedPoints.error });
  }

  const state = normalizeElevationState(body.state);
  try {
    const mode = body.mode;
    const result = await lookupAhdElevations({ state, points: parsedPoints.points, mode });
    if (result.error) {
      return res.status(result.status || 400).json({ ok: false, error: result.error, state });
    }
    const rows = result.elevations || [];
    const hits = rows.filter((row) => row?.ahdM != null).length;
    const ahdValues = rows.map((row) => Number(row.ahdM)).filter((v) => Number.isFinite(v));
    const spreadM =
      ahdValues.length > 1
        ? (Math.max(...ahdValues) - Math.min(...ahdValues)).toFixed(2)
        : "0";
    console.log(
      `[maps/elevation-ahd] mode=${result.mode || mode || "survey"} ${parsedPoints.points.length} points, ${hits} hits, spread=${spreadM}m`
    );
    return res.json({ ok: true, ...result });
  } catch (e) {
    console.error("[maps/elevation-ahd] lookup error:", e);
    return res.status(502).json({
      ok: false,
      error: e.message || "Elevation service unavailable",
      state,
    });
  }
});

// --- Vicmap monument box around site boundary (NW/NE/SE/SW) ---
app.post("/api/maps/elevation-monument-box", async (req, res) => {
  const isAdmin = await isAdminRequest(req);
  if (!isAdmin) {
    return res.status(403).json({ ok: false, error: "Admin access required" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const state = normalizeElevationState(body.state);
  const geometry = body.geometry;

  if (!geometry || typeof geometry !== "object") {
    return res.status(400).json({ ok: false, error: "geometry is required" });
  }

  try {
    const result = await lookupMonumentBox({ state, geometry });
    if (result.error) {
      return res.status(result.status || 400).json({ ok: false, error: result.error, state });
    }
    console.log(
      `[maps/elevation-monument-box] monuments found, encapsulates=${result.encapsulatesSite}, missing=${result.missing?.join(",") || "none"}, boundary=${result.boundaryElevations?.filter((row) => row.ahdM != null).length ?? 0}/${result.boundaryElevations?.length ?? 0}`
    );
    return res.json({ ok: true, ...result });
  } catch (e) {
    console.error("[maps/elevation-monument-box] lookup error:", e);
    return res.status(502).json({
      ok: false,
      error: e.message || "Monument box service unavailable",
      state,
    });
  }
});

// --- Maps floor plans (settings) ---
app.get("/api/maps/floor-plans", async (req, res) => {
  if (!pool) return res.status(500).json({ ok: false, error: "DATABASE_URL not set" });
  const isAdmin = await isAdminRequest(req);
  if (!isAdmin) return res.status(403).json({ ok: false, error: "Admin access required" });
  try {
    const plans = await listFloorPlans(pool);
    return res.json({ ok: true, floorPlans: plans });
  } catch (e) {
    console.error("[floor-plans] list error:", e);
    return res.status(500).json({ ok: false, error: e.message || "Failed to list floor plans" });
  }
});

app.get("/api/maps/floor-plans/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ ok: false, error: "DATABASE_URL not set" });
  const isAdmin = await isAdminRequest(req);
  if (!isAdmin) return res.status(403).json({ ok: false, error: "Admin access required" });
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "Invalid floor plan id" });
    const plan = await getFloorPlan(pool, id);
    if (!plan) return res.status(404).json({ ok: false, error: "Floor plan not found" });
    return res.json({ ok: true, floorPlan: plan });
  } catch (e) {
    console.error("[floor-plans] get error:", e);
    return res.status(500).json({ ok: false, error: e.message || "Failed to load floor plan" });
  }
});

app.get("/api/maps/floor-plans/:id/image", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  const isAdmin = await isAdminRequest(req);
  if (!isAdmin) return res.status(403).json({ error: "Admin access required" });
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid floor plan id" });
    const filePath = await getFloorPlanImagePath(pool, id);
    if (!filePath) return res.status(404).json({ error: "File not found" });
    if (path.extname(filePath).toLowerCase() === ".pdf") {
      res.type("application/pdf");
    }
    return res.sendFile(filePath);
  } catch (e) {
    console.error("[floor-plans] image error:", e);
    return res.status(500).json({ error: e.message || "Failed to load image" });
  }
});

app.post("/api/maps/floor-plans", upload.single("image"), async (req, res) => {
  if (!pool) return res.status(500).json({ ok: false, error: "DATABASE_URL not set" });
  const isAdmin = await isAdminRequest(req);
  if (!isAdmin) return res.status(403).json({ ok: false, error: "Admin access required" });
  try {
    const parsed = parseFloorPlanFields(req.body || {}, { requireScale: Boolean(req.file) });
    if (parsed.error) return res.status(400).json({ ok: false, error: parsed.error });
    const plan = await createFloorPlan(pool, parsed, req.file || null);
    return res.status(201).json({ ok: true, floorPlan: plan });
  } catch (e) {
    console.error("[floor-plans] create error:", e);
    return res.status(500).json({ ok: false, error: e.message || "Failed to create floor plan" });
  }
});

app.put("/api/maps/floor-plans/:id", upload.single("image"), async (req, res) => {
  if (!pool) return res.status(500).json({ ok: false, error: "DATABASE_URL not set" });
  const isAdmin = await isAdminRequest(req);
  if (!isAdmin) return res.status(403).json({ ok: false, error: "Admin access required" });
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "Invalid floor plan id" });
    const parsed = parseFloorPlanFields(req.body || {}, { requireScale: Boolean(req.file) });
    if (parsed.error) return res.status(400).json({ ok: false, error: parsed.error });
    const result = await updateFloorPlan(pool, id, parsed, req.file || null);
    if (result.notFound) return res.status(404).json({ ok: false, error: "Floor plan not found" });
    return res.json({ ok: true, floorPlan: result.plan });
  } catch (e) {
    console.error("[floor-plans] update error:", e);
    return res.status(500).json({ ok: false, error: e.message || "Failed to update floor plan" });
  }
});

app.patch("/api/maps/floor-plans/:id/dollar-value", async (req, res) => {
  if (!pool) return res.status(500).json({ ok: false, error: "DATABASE_URL not set" });
  const isAdmin = await isAdminRequest(req);
  if (!isAdmin) return res.status(403).json({ ok: false, error: "Admin access required" });
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "Invalid floor plan id" });
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const result = await updateFloorPlanDollarValue(pool, id, body.dollarValue ?? body.dollar_value);
    if (result.error) {
      return res.status(result.status || 400).json({ ok: false, error: result.error });
    }
    if (result.notFound) return res.status(400).json({ ok: false, error: "Floor plan not found" });
    return res.json({ ok: true, floorPlan: result.plan });
  } catch (e) {
    console.error("[floor-plans] dollar-value error:", e);
    return res.status(500).json({ ok: false, error: e.message || "Failed to update dollar value" });
  }
});

app.patch("/api/maps/floor-plans/:id/define-3d", async (req, res) => {
  if (!pool) return res.status(500).json({ ok: false, error: "DATABASE_URL not set" });
  const isAdmin = await isAdminRequest(req);
  if (!isAdmin) return res.status(403).json({ ok: false, error: "Admin access required" });
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "Invalid floor plan id" });
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const result = await updateFloorPlanDefine3D(pool, id, body.define3d ?? body);
    if (result.error) {
      return res.status(result.status || 400).json({ ok: false, error: result.error });
    }
    if (result.notFound) return res.status(404).json({ ok: false, error: "Floor plan not found" });
    return res.json({ ok: true, floorPlan: result.plan });
  } catch (e) {
    console.error("[floor-plans] define-3d error:", e);
    return res.status(500).json({ ok: false, error: e.message || "Failed to save Define 3D data" });
  }
});

app.delete("/api/maps/floor-plans/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ ok: false, error: "DATABASE_URL not set" });
  const isAdmin = await isAdminRequest(req);
  if (!isAdmin) return res.status(403).json({ ok: false, error: "Admin access required" });
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "Invalid floor plan id" });
    const result = await deleteFloorPlan(pool, id);
    if (result.notFound) return res.status(404).json({ ok: false, error: "Floor plan not found" });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[floor-plans] delete error:", e);
    return res.status(500).json({ ok: false, error: e.message || "Failed to delete floor plan" });
  }
});

// --- Maps quote checklist (settings + maps quote modal) ---
app.get("/api/maps/quote-items", async (req, res) => {
  if (!pool) return res.status(500).json({ ok: false, error: "DATABASE_URL not set" });
  const isAdmin = await isAdminRequest(req);
  if (!isAdmin) return res.status(403).json({ ok: false, error: "Admin access required" });
  try {
    const items = await listQuoteItems(pool);
    return res.json({ ok: true, items });
  } catch (e) {
    console.error("[quote-items] list error:", e);
    return res.status(500).json({ ok: false, error: e.message || "Failed to list quote items" });
  }
});

app.put("/api/maps/quote-items", async (req, res) => {
  if (!pool) return res.status(500).json({ ok: false, error: "DATABASE_URL not set" });
  const isAdmin = await isAdminRequest(req);
  if (!isAdmin) return res.status(403).json({ ok: false, error: "Admin access required" });
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const result = await saveQuoteItems(pool, body.items);
    if (result.error) {
      return res.status(result.status || 400).json({ ok: false, error: result.error });
    }
    return res.json({ ok: true, items: result.items });
  } catch (e) {
    console.error("[quote-items] save error:", e);
    return res.status(500).json({ ok: false, error: e.message || "Failed to save quote items" });
  }
});

app.post(
  "/api/maps/generate-proposal",
  upload.fields([
    { name: "visual3d", maxCount: 1 },
    { name: "mapScreenshot", maxCount: 1 },
  ]),
  async (req, res) => {
    if (!pool) return res.status(500).json({ ok: false, error: "DATABASE_URL not set" });
    const isAdmin = await isAdminRequest(req);
    if (!isAdmin) return res.status(403).json({ ok: false, error: "Admin access required" });
    try {
      let quoteItems = [];
      if (req.body?.quoteItems) {
        try {
          quoteItems = JSON.parse(req.body.quoteItems);
        } catch {
          return res.status(400).json({ ok: false, error: "Invalid quoteItems JSON" });
        }
      }
      if (!Array.isArray(quoteItems)) {
        return res.status(400).json({ ok: false, error: "quoteItems must be an array" });
      }

      const visual3dBuffer = req.files?.visual3d?.[0]?.buffer || null;
      const mapBuffer = req.files?.mapScreenshot?.[0]?.buffer || null;
      if (!visual3dBuffer?.length) {
        return res.status(400).json({ ok: false, error: "3D visualisation image is required" });
      }
      if (!mapBuffer?.length) {
        return res.status(400).json({ ok: false, error: "Map screenshot is required" });
      }

      const outputPath = await generateMapsProposalPdf({
        visual3dBuffer,
        mapBuffer,
        quoteItems,
        addressLabel: req.body?.addressLabel || "",
      });

      return res.json({
        ok: true,
        path: outputPath,
        filename: OUTPUT_FILENAME,
        folder: PROPOSAL_DIR,
      });
    } catch (e) {
      console.error("[maps/generate-proposal] error:", e);
      const status = e.code === "MISSING_FILE" ? 400 : 500;
      return res.status(status).json({ ok: false, error: e.message || "Failed to generate proposal PDF" });
    }
  }
);

// --- Map basemap config & Nearmap tile proxy (keeps API key server-side) ---
const NEARMAP_API_KEY = String(
  process.env.NEARMAP_API_KEY || process.env.REACT_APP_NEARMAP_API_KEY || ""
).trim();

app.get("/api/maps/basemap-config", (_req, res) => {
  res.json({
    nearmapEnabled: Boolean(NEARMAP_API_KEY),
    defaultBasemapId: "vicmap-aerial",
  });
});

app.get("/api/maps/nearmap-tiles/:z/:x/:y.jpg", async (req, res) => {
  if (!NEARMAP_API_KEY) {
    return res.status(404).json({ error: "Nearmap not configured" });
  }
  const z = Number.parseInt(req.params.z, 10);
  const x = Number.parseInt(req.params.x, 10);
  const y = Number.parseInt(req.params.y, 10);
  if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y)) {
    return res.status(400).json({ error: "Invalid tile coordinates" });
  }
  if (z < 0 || z > 24) {
    return res.status(400).json({ error: "Invalid zoom" });
  }

  const upstream = `https://api.nearmap.com/tiles/v3/Vert/${z}/${x}/${y}.jpg?apikey=${encodeURIComponent(NEARMAP_API_KEY)}`;
  try {
    const upstreamRes = await fetch(upstream, {
      headers: { Accept: "image/*" },
    });
    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).end();
    }
    const contentType = upstreamRes.headers.get("content-type") || "image/jpeg";
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=86400");
    const body = Buffer.from(await upstreamRes.arrayBuffer());
    return res.send(body);
  } catch (e) {
    console.error("[nearmap-tiles] proxy error:", e.message || e);
    return res.status(502).json({ error: "Nearmap tile proxy failed" });
  }
});

// Geocode one project and persist project_lat/project_lng (only if missing unless force=true)
app.post("/api/projects/:id/geocode", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
  const force = !!(req.body && req.body.force);

  try {
    const r = await pool.query(
      "SELECT id, street, suburb, state, project_lat, project_lng FROM projects WHERE id = $1",
      [id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "not found" });
    const row = r.rows[0];
    const existingLat = row.project_lat;
    const existingLng = row.project_lng;
    if (!force && existingLat != null && existingLng != null) {
      return res.json({ ok: true, id, lat: existingLat, lng: existingLng, cached: true });
    }

    const state = String(row.state || "").trim().toUpperCase();
    const street = String(row.street || "").trim();
    const suburb = String(row.suburb || "").trim();
    const addr = [street, suburb, state].filter(Boolean).join(", ");
    if (!addr) return res.status(400).json({ error: "missing address" });

    const hit = await geocodeWithNominatim(addr);
    if (!hit) return res.status(404).json({ error: "geocode not found" });

    await pool.query(
      "UPDATE projects SET project_lat = $1, project_lng = $2, project_geocoded_at = NOW(), updated_at = NOW() WHERE id = $3",
      [hit.lat, hit.lng, id]
    );

    res.json({ ok: true, id, lat: hit.lat, lng: hit.lng, cached: false, display_name: hit.display_name, query: addr });
  } catch (e) {
    console.error("Error geocoding project:", e);
    res.status(500).json({ error: e.message || "geocode failed" });
  }
});

/** Clear / default all fields used by the Windows page (PUT cannot null these via COALESCE). */
app.post("/api/projects/:id/reset-window-data", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  const isAdmin = await isAdminRequest(req);
  if (!isAdmin) {
    return res.status(403).json({ error: "Admin access required" });
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }
  try {
    const r = await pool.query(
      `UPDATE projects SET
        window_status = 'Not Ordered',
        window_colour = NULL,
        window_reveal = '95mm',
        window_reveal_other = NULL,
        window_glazing = 'Double',
        window_bal_rating = 'None',
        window_date_required = NULL,
        window_ordered_date = NULL,
        window_order_pdf_location = NULL,
        window_order_number = NULL,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
      [id]
    );
    if (r.rowCount === 0) {
      return res.status(404).json({ error: "not found" });
    }
    res.json(r.rows[0]);
  } catch (e) {
    console.error("reset-window-data:", e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Before saving a new drawings path: confirm the exact job folder
 * `<root>/<year>/<STATE>/<SUBURB - street>` exists on disk (same rules as Drawings page).
 * On failure: emails Ben and returns 409 (client shows message; do not PUT or send usual drawing emails).
 */
app.post("/api/projects/:id/verify-drawings-job-folder", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id", code: "INVALID_ID" });
  }
  try {
    const pr = await pool.query(
      "SELECT id, name, suburb, street, state, year FROM projects WHERE id = $1",
      [id]
    );
    if (pr.rows.length === 0) {
      return res.status(404).json({ error: "Project not found", code: "NOT_FOUND" });
    }
    const row = pr.rows[0];
    const stateUpper = String(row.state || "").trim().toUpperCase();
    if (!stateUpper) {
      return res.status(400).json({
        error: "Project state is required",
        code: "MISSING_STATE",
      });
    }
    const suburb = String(row.suburb || "").trim();
    const street = String(row.street || "").trim();
    if (!suburb || !street) {
      return res.status(400).json({
        error: "Project suburb and street are required to locate the job folder",
        code: "MISSING_ADDRESS",
      });
    }

    const sr = await pool.query(
      "SELECT root_directory, root_directory_qld FROM settings WHERE id = 1"
    );
    const settingsRow = sr.rows[0] || {};
    const rootDir = resolveRootDirForProjectDrawings(settingsRow, stateUpper);
    if (!rootDir) {
      return res.status(400).json({
        error: "Root directory is not set in File Settings for this state",
        code: "NO_ROOT",
      });
    }

    const yearSeg = getProjectYearFolderSegment(row.year);
    const folderLeaf = buildJobProjectFolderName(row.suburb, row.street);
    const expectedFolderAbs = path.resolve(path.join(rootDir, yearSeg, stateUpper, folderLeaf));
    const ok = await pathExistsAsDirectory(expectedFolderAbs);
    if (ok) {
      const publishedPlansDir = path.join(expectedFolderAbs, "2. PUBLISHED PLANS");
      return res.json({
        ok: true,
        expectedPath: expectedFolderAbs,
        publishedPlansDir,
        projectName: projectDisplayNameForDrawingsAlert(row),
      });
    }

    const projectName = projectDisplayNameForDrawingsAlert(row);
    const emailResult = await sendDrawingsJobFolderMismatchAlertEmail(pool, {
      projectId: id,
      projectName,
      expectedFolderPath: expectedFolderAbs,
    });

    return res.status(409).json({
      ok: false,
      code: "DRAWINGS_JOB_FOLDER_NOT_FOUND",
      error: `Folder not found for ${projectName}`,
      projectName,
      expectedPath: expectedFolderAbs,
      alertEmailSent: emailResult.sent === true,
    });
  } catch (e) {
    console.error("verify-drawings-job-folder:", e);
    return res.status(500).json({ error: e.message || "verification failed" });
  }
});

// User names for login dropdown (no passwords)
app.get("/api/users/names", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const usersResult = await pool.query(
      `SELECT id, name FROM users ORDER BY name ASC, id ASC`
    );
    res.json(usersResult.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Login with per-user password
app.post("/api/auth/login", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });

  const { userId, password } = req.body || {};
  const id = Number(userId);
  if (!Number.isFinite(id) || password == null || String(password).length === 0) {
    return res.status(400).json({ error: "userId and password required" });
  }

  try {
    const userResult = await pool.query(
      `SELECT u.id, u.name, u.password, u.primary_position_id,
              COALESCE(
                json_agg(json_build_object('id', p.id, 'name', p.name) ORDER BY p.name)
                  FILTER (WHERE p.id IS NOT NULL),
                '[]'::json
              ) AS positions
       FROM users u
       LEFT JOIN user_positions up ON up.user_id = u.id
       LEFT JOIN positions p ON p.id = up.position_id
       WHERE u.id = $1
       GROUP BY u.id, u.name, u.password, u.primary_position_id`,
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: "Incorrect password" });
    }

    const user = userResult.rows[0];
    const storedPassword = user.password || "admin";
    if (String(password) !== storedPassword) {
      return res.status(401).json({ error: "Incorrect password" });
    }

    const positions = Array.isArray(user.positions) ? user.positions : [];

    touchUserPresence(user.id);

    res.json({
      userId: user.id,
      passwordType: "global",
      user: {
        id: user.id,
        name: user.name,
        primary_position_id: user.primary_position_id,
        positions,
      },
    });
  } catch (e) {
    console.error("Error during login:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/auth/presence", (req, res) => {
  const userId = req.headers["x-user-id"] || req.headers["X-User-Id"];
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  touchUserPresence(userId);
  res.json({ ok: true });
});

app.post("/api/auth/logout", (req, res) => {
  const userId = req.headers["x-user-id"] || req.headers["X-User-Id"];
  if (userId) {
    clearUserPresence(userId);
  }
  res.json({ ok: true });
});

function getRequestUserId(req) {
  const userId = Number(req.headers["x-user-id"] || req.headers["X-User-Id"]);
  return Number.isFinite(userId) ? userId : null;
}

// User-to-user messages (inbox)
app.get("/api/messages/inbox", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  const userId = getRequestUserId(req);
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const result = await pool.query(
      `SELECT m.id, m.from_user_id, m.to_user_id, m.body, m.read_at, m.created_at,
              u.name AS from_user_name
       FROM user_messages m
       JOIN users u ON u.id = m.from_user_id
       WHERE m.to_user_id = $1
       ORDER BY m.created_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (e) {
    console.error("Error fetching message inbox:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/messages", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  const fromUserId = getRequestUserId(req);
  if (!fromUserId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const toUserId = Number(req.body?.toUserId);
  const body = String(req.body?.body ?? "").trim();

  if (!Number.isFinite(toUserId)) {
    return res.status(400).json({ error: "toUserId required" });
  }
  if (!body) {
    return res.status(400).json({ error: "Message body required" });
  }
  if (toUserId === fromUserId) {
    return res.status(400).json({ error: "Cannot message yourself" });
  }

  try {
    const userCheck = await pool.query(`SELECT id FROM users WHERE id = $1`, [toUserId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: "Recipient not found" });
    }

    const result = await pool.query(
      `INSERT INTO user_messages (from_user_id, to_user_id, body)
       VALUES ($1, $2, $3)
       RETURNING id, from_user_id, to_user_id, body, read_at, created_at`,
      [fromUserId, toUserId, body]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error("Error sending message:", e);
    res.status(500).json({ error: e.message });
  }
});

app.patch("/api/messages/:id/read", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  const userId = getRequestUserId(req);
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const messageId = Number(req.params.id);
  if (!Number.isFinite(messageId)) {
    return res.status(400).json({ error: "Invalid message id" });
  }

  try {
    const result = await pool.query(
      `UPDATE user_messages
       SET read_at = COALESCE(read_at, NOW())
       WHERE id = $1 AND to_user_id = $2
       RETURNING id, from_user_id, to_user_id, body, read_at, created_at`,
      [messageId, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Message not found" });
    }
    res.json(result.rows[0]);
  } catch (e) {
    console.error("Error marking message read:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/messages/unread-count", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  const userId = getRequestUserId(req);
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM user_messages
       WHERE to_user_id = $1 AND read_at IS NULL`,
      [userId]
    );
    res.json({ count: result.rows[0]?.count ?? 0 });
  } catch (e) {
    console.error("Error fetching unread message count:", e);
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/messages/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  const userId = getRequestUserId(req);
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const messageId = Number(req.params.id);
  if (!Number.isFinite(messageId)) {
    return res.status(400).json({ error: "Invalid message id" });
  }

  try {
    const result = await pool.query(
      `DELETE FROM user_messages
       WHERE id = $1 AND to_user_id = $2 AND read_at IS NOT NULL
       RETURNING id`,
      [messageId, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Message not found or not yet read" });
    }
    res.json({ ok: true, id: result.rows[0].id });
  } catch (e) {
    console.error("Error deleting message:", e);
    res.status(500).json({ error: e.message });
  }
});

// List users
app.get("/api/users", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const usersResult = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.primary_position_id, u.ui_theme_id,
              COALESCE(u.password, 'admin') AS password,
              u.created_at, u.updated_at,
              COALESCE(
                json_agg(json_build_object('id', p.id, 'name', p.name) ORDER BY p.name)
                  FILTER (WHERE p.id IS NOT NULL),
                '[]'::json
              ) AS positions
       FROM users u
       LEFT JOIN user_positions up ON up.user_id = u.id
       LEFT JOIN positions p ON p.id = up.position_id
       GROUP BY u.id, u.name, u.email, u.phone, u.primary_position_id, u.ui_theme_id, u.password, u.created_at, u.updated_at
       ORDER BY u.name ASC, u.id ASC`
    );
    res.json(usersResult.rows);
  } catch (e) {
    console.error("Error fetching users:", e);
    console.error("Error stack:", e.stack);
    res.status(500).json({ error: e.message });
  }
});

// Create user
app.post("/api/users", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const { name, email, phone, positionIds, primaryPositionId, password } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });

    await pool.query('BEGIN');
    
    // Create the user
    const userResult = await pool.query(
      `INSERT INTO users (name, email, phone, primary_position_id, password) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        name.trim(),
        email ? email.trim() : null,
        phone ? phone.trim() : null,
        primaryPositionId ? parseInt(primaryPositionId) : null,
        password && String(password).trim() !== "" ? String(password) : "admin",
      ]
    );

    const userId = userResult.rows[0].id;

    // Add positions if provided
    if (positionIds && Array.isArray(positionIds) && positionIds.length > 0) {
      for (const positionId of positionIds) {
        await pool.query(
          `INSERT INTO user_positions (user_id, position_id) 
           VALUES ($1, $2) 
           ON CONFLICT (user_id, position_id) DO NOTHING`,
          [userId, parseInt(positionId)]
        );
      }
    }

    await pool.query('COMMIT');

    // Fetch user with positions
    const userWithPositionsResult = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.primary_position_id,
              COALESCE(u.password, 'admin') AS password,
              u.created_at, u.updated_at 
       FROM users u WHERE u.id = $1`,
      [userId]
    );
    const positionsResult = await pool.query(
      `SELECT p.id, p.name 
       FROM positions p 
       INNER JOIN user_positions up ON p.id = up.position_id 
       WHERE up.user_id = $1`,
      [userId]
    );

    res.json({
      ...userWithPositionsResult.rows[0],
      positions: positionsResult.rows,
    });
  } catch (e) {
    await pool.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  }
});

// Access permissions matrix (Settings → Permissions)
app.get("/api/access-permissions", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const usersResult = await pool.query(
      `SELECT id, name, COALESCE(password, 'admin') AS password FROM users ORDER BY name ASC, id ASC`
    );
    const grantsResult = await pool.query(
      `SELECT user_id, access_area, granted FROM user_access_permissions`
    );
    res.json({
      areas: ACCESS_AREAS,
      users: usersResult.rows,
      matrix: buildAccessPermissionsMatrix(usersResult.rows, grantsResult.rows),
    });
  } catch (e) {
    console.error("Error fetching access permissions:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/access-permissions/online", (req, res) => {
  res.json({ onlineUserIds: getOnlineUserIds() });
});

app.get("/api/access-permissions/me", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const userId = Number(req.headers["x-user-id"] || req.headers["X-User-Id"]);
    if (!Number.isFinite(userId)) {
      return res.json({ grants: {} });
    }

    const grantsResult = await pool.query(
      `SELECT access_area, granted FROM user_access_permissions WHERE user_id = $1`,
      [userId]
    );

    const grants = {};
    for (const area of ACCESS_AREAS) {
      grants[area.key] = false;
    }
    for (const row of grantsResult.rows) {
      if (ACCESS_AREA_KEYS.has(row.access_area)) {
        grants[row.access_area] = row.granted === true;
      }
    }

    res.json({ grants });
  } catch (e) {
    console.error("Error fetching user access permissions:", e);
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/access-permissions", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const { userId, accessArea, granted } = req.body || {};
    const id = Number(userId);
    const area = String(accessArea || "").trim().toLowerCase();

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "userId required" });
    }
    if (!ACCESS_AREA_KEYS.has(area)) {
      return res.status(400).json({ error: "Invalid access area" });
    }
    if (typeof granted !== "boolean") {
      return res.status(400).json({ error: "granted must be a boolean" });
    }

    const userCheck = await pool.query(`SELECT id FROM users WHERE id = $1`, [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    await pool.query(
      `INSERT INTO user_access_permissions (user_id, access_area, granted, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, access_area)
       DO UPDATE SET granted = EXCLUDED.granted, updated_at = NOW()`,
      [id, area, granted]
    );

    res.json({ ok: true, userId: id, accessArea: area, granted });
  } catch (e) {
    console.error("Error saving access permission:", e);
    res.status(500).json({ error: e.message });
  }
});

// List positions
app.get("/api/positions", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const r = await pool.query(
      "SELECT id, name, created_at, updated_at FROM positions ORDER BY name ASC, id ASC"
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update user
app.put("/api/users/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  try {
    const { name, email, phone, positionIds, primaryPositionId, password, uiThemeId, ui_theme_id } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });

    const resolvedUiThemeId =
      uiThemeId != null || ui_theme_id != null
        ? normalizeUiThemeId(uiThemeId ?? ui_theme_id)
        : null;

    await pool.query('BEGIN');

    // Update the user
    const userResult = await pool.query(
      `UPDATE users 
       SET name = $1, email = $2, phone = $3, primary_position_id = $4,
           password = COALESCE($5, password, 'admin'),
           ui_theme_id = COALESCE($6, ui_theme_id),
           updated_at = NOW()
       WHERE id = $7 
       RETURNING *`,
      [
        name.trim(),
        email ? email.trim() : null,
        phone ? phone.trim() : null,
        primaryPositionId ? parseInt(primaryPositionId) : null,
        password != null && String(password).trim() !== "" ? String(password) : null,
        resolvedUiThemeId,
        id,
      ]
    );

    if (userResult.rows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: "user not found" });
    }

    // Delete existing positions
    await pool.query('DELETE FROM user_positions WHERE user_id = $1', [id]);

    // Add new positions if provided
    if (positionIds && Array.isArray(positionIds) && positionIds.length > 0) {
      for (const positionId of positionIds) {
        await pool.query(
          `INSERT INTO user_positions (user_id, position_id) 
           VALUES ($1, $2) 
           ON CONFLICT (user_id, position_id) DO NOTHING`,
          [id, parseInt(positionId)]
        );
      }
    }

    await pool.query('COMMIT');

    // Fetch user with positions
    const positionsResult = await pool.query(
      `SELECT p.id, p.name 
       FROM positions p 
       INNER JOIN user_positions up ON p.id = up.position_id 
       WHERE up.user_id = $1`,
      [id]
    );

    res.json({
      ...userResult.rows[0],
      positions: positionsResult.rows,
    });
  } catch (e) {
    await pool.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  }
});

// Delete user
app.delete("/api/users/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  try {
    await pool.query('BEGIN');
    const r = await pool.query(
      "DELETE FROM users WHERE id = $1 RETURNING *",
      [id]
    );
    if (r.rowCount === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: "not found" });
    }
    await pool.query('COMMIT');
    res.json({ success: true, deleted: r.rows[0] });
  } catch (e) {
    try { await pool.query('ROLLBACK'); } catch {}
    res.status(500).json({ error: e.message || "Failed to delete user" });
  }
});

// Create position
app.post("/api/positions", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });

    const r = await pool.query(
      `INSERT INTO positions (name) 
       VALUES ($1) RETURNING *`,
      [name.trim()]
    );

    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update position
app.put("/api/positions/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });

    const r = await pool.query(
      `UPDATE positions 
       SET name = $1, updated_at = NOW()
       WHERE id = $2 
       RETURNING *`,
      [name.trim(), id]
    );

    if (r.rows.length === 0) {
      return res.status(404).json({ error: "position not found" });
    }

    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete position
app.delete("/api/positions/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  try {
    const r = await pool.query(
      "DELETE FROM positions WHERE id = $1 RETURNING *",
      [id]
    );
    if (r.rowCount === 0) {
      return res.status(404).json({ error: "not found" });
    }
    res.json({ success: true, deleted: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to delete position" });
  }
});

// Get settings
app.get("/api/settings", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const r = await pool.query(
      `SELECT id, root_directory, create_folders, root_directory_qld, create_folders_qld, test_project_name_qld, test_folder_qld, global_password, admin_password, colour_attachments_vic, colour_attachments_qld, send_drawings_vic, send_drawings_qld, email_logo_path, letterhead_path, drawings_vic_design_to_salesperson_email, drawings_vic_salesperson_to_client_email, drawings_qld_design_to_salesperson_email, drawings_qld_salesperson_to_client_email, drawings_investor_streams_design_to_salesperson_email, drawings_investor_streams_salesperson_to_client_email, drawings_vic_design_to_salesperson_to_email, drawings_qld_design_to_salesperson_to_email, stream_settings_json, email_general_json, ${SETTINGS_SMTP_1_16_COLUMNS}, updated_at FROM settings WHERE id = 1`
    );
    if (r.rows.length === 0) {
      const empty = {
        id: 1,
        root_directory: null,
        create_folders: "true",
        root_directory_qld: null,
        create_folders_qld: "true",
        test_project_name_qld: null,
        test_folder_qld: null,
        global_password: null,
        admin_password: null,
        colour_attachments_vic: null,
        colour_attachments_qld: null,
        send_drawings_vic: [],
        send_drawings_qld: [],
        email_logo_path: null,
        letterhead_path: null,
        drawings_vic_design_to_salesperson_email: null,
        drawings_vic_salesperson_to_client_email: null,
        drawings_qld_design_to_salesperson_email: null,
        drawings_qld_salesperson_to_client_email: null,
        drawings_investor_streams_design_to_salesperson_email: null,
        drawings_investor_streams_salesperson_to_client_email: null,
        drawings_vic_design_to_salesperson_to_email: null,
        drawings_qld_design_to_salesperson_to_email: null,
        stream_settings_json: {},
        email_general_json: {
          hotList: { soldFromEmail: "", soldToEmail: "", qldSoldFromEmail: "", qldSoldToEmail: "" },
        },
        updated_at: null,
      };
      for (let i = 1; i <= 16; i++) {
        empty[`smtp_user_${i}`] = null;
        empty[`smtp_pass_${i}`] = null;
      }
      return res.json(empty);
    }
    // Parse JSON arrays in response
    const result = r.rows[0];
    if (result.send_drawings_vic) {
      try {
        result.send_drawings_vic = JSON.parse(result.send_drawings_vic);
      } catch (e) {
        result.send_drawings_vic = [];
      }
    } else {
      result.send_drawings_vic = [];
    }
    if (result.send_drawings_qld) {
      try {
        result.send_drawings_qld = JSON.parse(result.send_drawings_qld);
      } catch (e) {
        result.send_drawings_qld = [];
      }
    } else {
      result.send_drawings_qld = [];
    }
    result.stream_settings_json = parseStreamSettingsJsonColumn(result.stream_settings_json);
    result.email_general_json = parseEmailGeneralJsonColumn(result.email_general_json);
    res.json(result);
  } catch (e) {
    console.error("Error fetching settings:", e);
    console.error("Error stack:", e.stack);
    res.status(500).json({ error: e.message });
  }
});

// UI button style presets (Settings → UI → Buttons) — shared app-wide
app.get("/api/ui-button-styles", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  const userId = getRequestUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const r = await pool.query("SELECT ui_button_styles_json FROM settings WHERE id = 1");
    const store = parseUiButtonStylesJsonColumn(r.rows[0]?.ui_button_styles_json);
    return res.json({ ok: true, store });
  } catch (e) {
    console.error("Error fetching UI button styles:", e);
    return res.status(500).json({ error: e.message || "Failed to fetch UI button styles" });
  }
});

app.put("/api/ui-button-styles", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  const isAdmin = await isAdminRequest(req);
  if (!isAdmin) return res.status(403).json({ error: "Admin access required" });
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const store = normalizeUiButtonStylesStore(body.store ?? body);
    const json = JSON.stringify(store);
    await pool.query(
      `INSERT INTO settings (id, ui_button_styles_json, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET ui_button_styles_json = EXCLUDED.ui_button_styles_json, updated_at = NOW()`,
      [json]
    );
    return res.json({ ok: true, store });
  } catch (e) {
    console.error("Error saving UI button styles:", e);
    return res.status(500).json({ error: e.message || "Failed to save UI button styles" });
  }
});

// Global UI theme palette colour overrides (Settings → UI → Palette)
app.get("/api/ui-theme-colors", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  const userId = getRequestUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const r = await pool.query("SELECT ui_theme_color_overrides_json FROM settings WHERE id = 1");
    const overrides = parseUiThemeColorOverridesColumn(r.rows[0]?.ui_theme_color_overrides_json);
    return res.json({ ok: true, overrides });
  } catch (e) {
    console.error("Error fetching UI theme colours:", e);
    return res.status(500).json({ error: e.message || "Failed to fetch UI theme colours" });
  }
});

app.put("/api/ui-theme-colors", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  const isAdmin = await isAdminRequest(req);
  if (!isAdmin) return res.status(403).json({ error: "Admin access required" });
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const overrides = normalizeUiThemeColorOverrides(body.overrides ?? body);
    const json = JSON.stringify(overrides);
    await pool.query(
      `INSERT INTO settings (id, ui_theme_color_overrides_json, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET ui_theme_color_overrides_json = EXCLUDED.ui_theme_color_overrides_json, updated_at = NOW()`,
      [json]
    );
    return res.json({ ok: true, overrides });
  } catch (e) {
    console.error("Error saving UI theme colours:", e);
    return res.status(500).json({ error: e.message || "Failed to save UI theme colours" });
  }
});

// Per-user colour palette (theme) preference
app.get("/api/users/me/ui-preferences", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  const userId = getRequestUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const r = await pool.query(`SELECT ui_theme_id FROM users WHERE id = $1`, [userId]);
    if (!r.rows.length) return res.status(404).json({ error: "User not found" });
    const uiThemeId = normalizeUiThemeId(r.rows[0].ui_theme_id);
    return res.json({ ok: true, uiThemeId });
  } catch (e) {
    console.error("Error fetching UI preferences:", e);
    return res.status(500).json({ error: e.message || "Failed to fetch UI preferences" });
  }
});

app.put("/api/users/me/ui-preferences", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  const userId = getRequestUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const uiThemeId = normalizeUiThemeId(body.uiThemeId ?? body.ui_theme_id);
    const r = await pool.query(
      `UPDATE users SET ui_theme_id = $1, updated_at = NOW() WHERE id = $2 RETURNING ui_theme_id`,
      [uiThemeId, userId]
    );
    if (!r.rows.length) return res.status(404).json({ error: "User not found" });
    return res.json({ ok: true, uiThemeId: normalizeUiThemeId(r.rows[0].ui_theme_id) });
  } catch (e) {
    console.error("Error saving UI preferences:", e);
    return res.status(500).json({ error: e.message || "Failed to save UI preferences" });
  }
});

// Update settings
app.put("/api/settings", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const {
      root_directory,
      create_folders,
      root_directory_qld,
      create_folders_qld,
      test_project_name_qld,
      test_folder_qld,
      global_password,
      admin_password,
      colour_attachments_vic,
      colour_attachments_qld,
      send_drawings_vic,
      send_drawings_qld,
      email_logo_path,
      letterhead_path,
      drawings_vic_design_to_salesperson_email,
      drawings_vic_salesperson_to_client_email,
      drawings_qld_design_to_salesperson_email,
      drawings_qld_salesperson_to_client_email,
      drawings_investor_streams_design_to_salesperson_email,
      drawings_investor_streams_salesperson_to_client_email,
      drawings_vic_design_to_salesperson_to_email,
      drawings_qld_design_to_salesperson_to_email,
      stream_settings_json,
      email_general_json,
    } = req.body || {};
    const body = req.body || {};

    const processValue = (val) => {
      if (val === undefined) return null;
      if (typeof val === "string") {
        const trimmed = val.trim();
        return trimmed === "" ? null : trimmed;
      }
      return null;
    };

    const processBoolean = (val) => {
      if (val === undefined) return null;
      if (val === true || val === "true" || val === "Y" || val === "y" || val === "1") return "true";
      return "false";
    };

    const processArray = (val) => {
      if (val === undefined || val === null) return null;
      if (Array.isArray(val)) {
        return JSON.stringify(val);
      }
      return null;
    };

    const processStreamSettingsJson = (val) => {
      if (val === undefined || val === null) return null;
      if (typeof val === "object") {
        return JSON.stringify(val);
      }
      if (typeof val === "string") {
        const t = val.trim();
        return t === "" ? null : t;
      }
      return null;
    };

    const processEmailGeneralJson = (val) => {
      if (val === undefined || val === null) return null;
      if (typeof val === "object" && !Array.isArray(val)) {
        return JSON.stringify(parseEmailGeneralJsonColumn(val));
      }
      if (typeof val === "string") {
        const t = val.trim();
        return t === "" ? null : t;
      }
      return null;
    };

    const smtpInsertCols = [];
    const smtpValuePlaceholders = [];
    const smtpCoalesceParts = [];
    const smtpParams = [];
    for (let i = 1; i <= 16; i++) {
      smtpInsertCols.push(`smtp_user_${i}`, `smtp_pass_${i}`);
      const uPn = 22 + (i - 1) * 2 + 1;
      const pPn = 22 + (i - 1) * 2 + 2;
      smtpValuePlaceholders.push(`$${uPn}`, `$${pPn}`);
      smtpCoalesceParts.push(
        `smtp_user_${i} = COALESCE($${uPn}, settings.smtp_user_${i})`,
        `smtp_pass_${i} = COALESCE($${pPn}, settings.smtp_pass_${i})`
      );
      smtpParams.push(processValue(body[`smtp_user_${i}`]), processValue(body[`smtp_pass_${i}`]));
    }

    const streamSettingsParam = processStreamSettingsJson(stream_settings_json);
    const streamSettingsParamIndex = 22 + smtpParams.length + 1;
    const emailGeneralParam = processEmailGeneralJson(email_general_json);
    const emailGeneralParamIndex = streamSettingsParamIndex + 1;

    const r = await pool.query(
      `INSERT INTO settings (id, root_directory, create_folders, root_directory_qld, create_folders_qld, test_project_name_qld, test_folder_qld, global_password, admin_password, colour_attachments_vic, colour_attachments_qld, send_drawings_vic, send_drawings_qld, email_logo_path, letterhead_path, drawings_vic_design_to_salesperson_email, drawings_vic_salesperson_to_client_email, drawings_qld_design_to_salesperson_email, drawings_qld_salesperson_to_client_email, drawings_investor_streams_design_to_salesperson_email, drawings_investor_streams_salesperson_to_client_email, drawings_vic_design_to_salesperson_to_email, drawings_qld_design_to_salesperson_to_email, ${smtpInsertCols.join(
        ", "
      )}, stream_settings_json, email_general_json, updated_at)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, ${smtpValuePlaceholders.join(", ")}, $${streamSettingsParamIndex}, $${emailGeneralParamIndex}, NOW())
       ON CONFLICT (id)
       DO UPDATE SET
         root_directory = COALESCE($1, settings.root_directory),
         create_folders = COALESCE($2, settings.create_folders),
         root_directory_qld = COALESCE($3, settings.root_directory_qld),
         create_folders_qld = COALESCE($4, settings.create_folders_qld),
         test_project_name_qld = COALESCE($5, settings.test_project_name_qld),
         test_folder_qld = COALESCE($6, settings.test_folder_qld),
         global_password = COALESCE($7, settings.global_password),
         admin_password = COALESCE($8, settings.admin_password),
         colour_attachments_vic = COALESCE($9, settings.colour_attachments_vic),
         colour_attachments_qld = COALESCE($10, settings.colour_attachments_qld),
         send_drawings_vic = COALESCE($11, settings.send_drawings_vic),
         send_drawings_qld = COALESCE($12, settings.send_drawings_qld),
         email_logo_path = COALESCE($13, settings.email_logo_path),
         letterhead_path = COALESCE($14, settings.letterhead_path),
         drawings_vic_design_to_salesperson_email = COALESCE($15, settings.drawings_vic_design_to_salesperson_email),
         drawings_vic_salesperson_to_client_email = COALESCE($16, settings.drawings_vic_salesperson_to_client_email),
         drawings_qld_design_to_salesperson_email = COALESCE($17, settings.drawings_qld_design_to_salesperson_email),
         drawings_qld_salesperson_to_client_email = COALESCE($18, settings.drawings_qld_salesperson_to_client_email),
         drawings_investor_streams_design_to_salesperson_email = COALESCE($19, settings.drawings_investor_streams_design_to_salesperson_email),
         drawings_investor_streams_salesperson_to_client_email = COALESCE($20, settings.drawings_investor_streams_salesperson_to_client_email),
         drawings_vic_design_to_salesperson_to_email = COALESCE($21, settings.drawings_vic_design_to_salesperson_to_email),
         drawings_qld_design_to_salesperson_to_email = COALESCE($22, settings.drawings_qld_design_to_salesperson_to_email),
         ${smtpCoalesceParts.join(",\n         ")},
         stream_settings_json = COALESCE($${streamSettingsParamIndex}, settings.stream_settings_json),
         email_general_json = COALESCE($${emailGeneralParamIndex}, settings.email_general_json),
         updated_at = NOW()
       RETURNING id, root_directory, create_folders, root_directory_qld, create_folders_qld, test_project_name_qld, test_folder_qld, global_password, admin_password, colour_attachments_vic, colour_attachments_qld, send_drawings_vic, send_drawings_qld, email_logo_path, letterhead_path, drawings_vic_design_to_salesperson_email, drawings_vic_salesperson_to_client_email, drawings_qld_design_to_salesperson_email, drawings_qld_salesperson_to_client_email, drawings_investor_streams_design_to_salesperson_email, drawings_investor_streams_salesperson_to_client_email, drawings_vic_design_to_salesperson_to_email, drawings_qld_design_to_salesperson_to_email, stream_settings_json, email_general_json, ${SETTINGS_SMTP_1_16_COLUMNS}, updated_at`,
      [
        processValue(root_directory),
        processBoolean(create_folders),
        processValue(root_directory_qld),
        processBoolean(create_folders_qld),
        processValue(test_project_name_qld),
        processValue(test_folder_qld),
        processValue(global_password),
        processValue(admin_password),
        processValue(colour_attachments_vic),
        processValue(colour_attachments_qld),
        processArray(send_drawings_vic),
        processArray(send_drawings_qld),
        processValue(email_logo_path),
        processValue(letterhead_path),
        processValue(drawings_vic_design_to_salesperson_email),
        processValue(drawings_vic_salesperson_to_client_email),
        processValue(drawings_qld_design_to_salesperson_email),
        processValue(drawings_qld_salesperson_to_client_email),
        processValue(drawings_investor_streams_design_to_salesperson_email),
        processValue(drawings_investor_streams_salesperson_to_client_email),
        processValue(drawings_vic_design_to_salesperson_to_email),
        processValue(drawings_qld_design_to_salesperson_to_email),
        ...smtpParams,
        streamSettingsParam,
        emailGeneralParam,
      ]
    );

    // Parse JSON arrays in response
    const result = r.rows[0];
    if (result.send_drawings_vic) {
      try {
        result.send_drawings_vic = JSON.parse(result.send_drawings_vic);
      } catch (e) {
        result.send_drawings_vic = [];
      }
    } else {
      result.send_drawings_vic = [];
    }
    if (result.send_drawings_qld) {
      try {
        result.send_drawings_qld = JSON.parse(result.send_drawings_qld);
      } catch (e) {
        result.send_drawings_qld = [];
      }
    } else {
      result.send_drawings_qld = [];
    }
    result.stream_settings_json = parseStreamSettingsJsonColumn(result.stream_settings_json);
    result.email_general_json = parseEmailGeneralJsonColumn(result.email_general_json);

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Send test email using SMTP credentials from SMTP Settings (validates user + password for a slot)
const SMTP_TEST_TO = "ben@superiorgrannyflats.com.au";
app.post("/api/emails/smtp-test", async (req, res) => {
  try {
    const { smtpUser, smtpPass } = req.body || {};
    const fromAddr = String(smtpUser || "").trim();
    const pass = smtpPass != null ? String(smtpPass) : "";

    if (!fromAddr) {
      return res.status(400).json({ error: "SMTP User (from address) is required" });
    }
    if (!pass) {
      return res.status(400).json({ error: "SMTP password is required" });
    }

    const host = process.env.SMTP_HOST || "smtp.office365.com";
    const port = parseInt(process.env.SMTP_PORT || "587", 10);
    const secure = process.env.SMTP_SECURE === "true";

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: fromAddr, pass },
    });

    await transporter.sendMail({
      from: fromAddr,
      to: SMTP_TEST_TO,
      subject: "[SGF] SMTP test",
      text: `This is a test message from SGF SMTP Settings.\nFrom: ${fromAddr}\nIf you received this, SMTP user and password work for this slot.`,
    });

    res.json({ ok: true, to: SMTP_TEST_TO });
  } catch (e) {
    console.error("POST /api/emails/smtp-test:", e);
    res.status(500).json({ error: e.message || "Failed to send test email" });
  }
});

// Per-project Drawing Manager notes (projects.drawing_manager_notes)
app.put("/api/projects/:id/drawing-manager-notes", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }
  try {
    const { notes } = req.body || {};
    const v = notes === undefined || notes === null ? null : String(notes);
    const r = await pool.query(
      `UPDATE projects SET drawing_manager_notes = $1, updated_at = NOW() WHERE id = $2 RETURNING id, drawing_manager_notes, updated_at`,
      [v, id]
    );
    if (r.rowCount === 0) {
      return res.status(404).json({ error: "not found" });
    }
    res.json({ ok: true, ...r.rows[0] });
  } catch (e) {
    console.error("PUT /api/projects/:id/drawing-manager-notes:", e);
    res.status(500).json({ error: e.message });
  }
});

// Get all email templates
app.get("/api/email-templates", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const result = await pool.query(
      "SELECT id, name, template_group, to_addresses, from_address, subject, body, created_at, updated_at FROM email_templates ORDER BY name ASC"
    );
    // Parse to_addresses from JSON string to array
    const templates = result.rows.map(row => ({
      ...row,
      to_addresses: row.to_addresses ? JSON.parse(row.to_addresses) : []
    }));
    res.json(templates);
  } catch (e) {
    console.error("Error fetching email templates:", e);
    res.status(500).json({ error: e.message });
  }
});

// Get single email template
app.get("/api/email-templates/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "invalid id" });
    }
    const result = await pool.query(
      "SELECT id, name, template_group, to_addresses, from_address, subject, body, created_at, updated_at FROM email_templates WHERE id = $1",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Email template not found" });
    }
    const template = {
      ...result.rows[0],
      to_addresses: result.rows[0].to_addresses ? JSON.parse(result.rows[0].to_addresses) : []
    };
    res.json(template);
  } catch (e) {
    console.error("Error fetching email template:", e);
    res.status(500).json({ error: e.message });
  }
});

// Create email template
app.post("/api/email-templates", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const { name, template_group, to_addresses, from_address, subject, body } = req.body || {};
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Template name is required" });
    }

    const toAddressesJson = Array.isArray(to_addresses) 
      ? JSON.stringify(to_addresses) 
      : (to_addresses ? JSON.stringify([to_addresses]) : null);

    const result = await pool.query(
      `INSERT INTO email_templates (name, template_group, to_addresses, from_address, subject, body, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id, name, template_group, to_addresses, from_address, subject, body, created_at, updated_at`,
      [name.trim(), template_group || null, toAddressesJson, from_address || null, subject || null, body || null]
    );

    const template = {
      ...result.rows[0],
      to_addresses: result.rows[0].to_addresses ? JSON.parse(result.rows[0].to_addresses) : []
    };
    res.json(template);
  } catch (e) {
    console.error("Error creating email template:", e);
    res.status(500).json({ error: e.message });
  }
});

// Update email template
app.put("/api/email-templates/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "invalid id" });
    }

    const { name, template_group, to_addresses, from_address, subject, body } = req.body || {};
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Template name is required" });
    }

    const toAddressesJson = Array.isArray(to_addresses) 
      ? JSON.stringify(to_addresses) 
      : (to_addresses ? JSON.stringify([to_addresses]) : null);

    const result = await pool.query(
      `UPDATE email_templates 
       SET name = $1, template_group = $2, to_addresses = $3, from_address = $4, subject = $5, body = $6, updated_at = NOW()
       WHERE id = $7
       RETURNING id, name, template_group, to_addresses, from_address, subject, body, created_at, updated_at`,
      [name.trim(), template_group || null, toAddressesJson, from_address || null, subject || null, body || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Email template not found" });
    }

    const template = {
      ...result.rows[0],
      to_addresses: result.rows[0].to_addresses ? JSON.parse(result.rows[0].to_addresses) : []
    };
    res.json(template);
  } catch (e) {
    console.error("Error updating email template:", e);
    res.status(500).json({ error: e.message });
  }
});

// Delete email template
app.delete("/api/email-templates/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "invalid id" });
    }

    const result = await pool.query(
      "DELETE FROM email_templates WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Email template not found" });
    }

    res.json({ success: true, deleted: result.rows[0] });
  } catch (e) {
    console.error("Error deleting email template:", e);
    res.status(500).json({ error: e.message });
  }
});

// Get custom email template groups
app.get("/api/email-template-groups", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const result = await pool.query(
      "SELECT id, name, created_at, updated_at FROM email_template_groups ORDER BY LOWER(name) ASC"
    );
    res.json(result.rows || []);
  } catch (e) {
    console.error("Error fetching email template groups:", e);
    res.status(500).json({ error: e.message });
  }
});

// Create custom email template group
app.post("/api/email-template-groups", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const { name } = req.body || {};
    const groupName = String(name || "").trim();
    if (!groupName) return res.status(400).json({ error: "Group name is required" });
    const result = await pool.query(
      `INSERT INTO email_template_groups (name, updated_at)
       VALUES ($1, NOW())
       ON CONFLICT (name) DO UPDATE SET updated_at = NOW()
       RETURNING id, name, created_at, updated_at`,
      [groupName]
    );
    res.json(result.rows[0]);
  } catch (e) {
    console.error("Error creating email template group:", e);
    res.status(500).json({ error: e.message });
  }
});

// Helper function to get SMTP credentials based on from_address
async function getSmtpCredentialsForFromAddress(fromAddress) {
  if (!pool) {
    return {
      smtpUser: process.env.SMTP_USER,
      smtpPass: process.env.SMTP_PASS,
    };
  }

  try {
    const settingsResult = await pool.query(
      `SELECT ${SETTINGS_SMTP_1_16_COLUMNS} FROM settings WHERE id = 1`
    );

    if (settingsResult.rows.length === 0) {
      return {
        smtpUser: process.env.SMTP_USER,
        smtpPass: process.env.SMTP_PASS,
      };
    }

    const settings = settingsResult.rows[0];
    const fromEmail = fromAddress?.trim().toLowerCase();

    if (fromEmail) {
      for (const i of SMTP_FROM_ADDRESS_MATCH_ORDER) {
        const u = settings[`smtp_user_${i}`];
        const p = settings[`smtp_pass_${i}`];
        if (!u || !p) continue;
        if (String(u).trim().toLowerCase() === fromEmail) {
          return { smtpUser: u, smtpPass: p };
        }
      }
    }

    const u1 = settings[`smtp_user_${SMTP_SLOT_DEFAULT}`];
    const p1 = settings[`smtp_pass_${SMTP_SLOT_DEFAULT}`];
    if (u1 && p1) {
      return {
        smtpUser: u1,
        smtpPass: p1,
      };
    }

    return {
      smtpUser: process.env.SMTP_USER,
      smtpPass: process.env.SMTP_PASS,
    };
  } catch (e) {
    console.error("Error fetching SMTP credentials:", e);
    return {
      smtpUser: process.env.SMTP_USER,
      smtpPass: process.env.SMTP_PASS,
    };
  }
}

function contentTypeForImageFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  return "image/jpeg";
}

// Helper: embed logo at end of HTML via CID inline part (visible in body, not a separate attachment)
async function addLogoToEmail(htmlBody, attachments = []) {
  if (!pool) {
    return { htmlBody, attachments };
  }

  let logoPath = null;
  try {
    const r = await pool.query("SELECT email_logo_path FROM settings WHERE id = 1");
    if (r.rows.length && r.rows[0].email_logo_path) {
      logoPath = String(r.rows[0].email_logo_path).trim();
    }
  } catch (e) {
    console.error("Error loading email logo path:", e.message);
    return { htmlBody, attachments };
  }

  if (!logoPath) {
    return { htmlBody, attachments };
  }

  try {
    await fs.access(logoPath);
    const logoBuffer = await fs.readFile(logoPath);
    const filename = path.basename(logoPath) || "logo";
    const contentType = contentTypeForImageFile(logoPath);

    attachments.push({
      filename,
      content: logoBuffer,
      cid: "sgf-logo",
      contentType,
      contentDisposition: "inline",
    });

    const logoHtml = `<br><br><div style="text-align: left; margin-top: 20px;"><img src="cid:sgf-logo" alt="" style="max-width: 200px; height: auto; display: block;" /></div>`;

    if (htmlBody.includes("</body>")) {
      htmlBody = htmlBody.replace("</body>", `${logoHtml}</body>`);
    } else if (htmlBody.includes("</html>")) {
      htmlBody = htmlBody.replace("</html>", `${logoHtml}</html>`);
    } else {
      htmlBody = htmlBody + logoHtml;
    }

    return { htmlBody, attachments };
  } catch (e) {
    console.error("Error adding logo to email:", e.message);
    return { htmlBody, attachments };
  }
}

// Multipart body for /api/emails/send (JSON is parsed by global middleware above)
function parseEmailSendRequest(req, res, next) {
  const contentType = (req.get("content-type") || "").toLowerCase();
  if (contentType.includes("multipart/form-data")) {
    return upload.single("attachment")(req, res, next);
  }
  next();
}

// Send HTML email via SMTP (JSON or multipart with optional attachment file)
app.post("/api/emails/send", parseEmailSendRequest, async (req, res) => {
  let to;
  let from;
  let subject;
  let htmlBody;
  let projectId;
  let rawAttachments;

  if (req.file) {
    const toRaw = String(req.body?.to || "").trim();
    to = toRaw
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
    from = String(req.body?.from || "").trim();
    subject = String(req.body?.subject || "");
    htmlBody = String(req.body?.htmlBody || "");
  } else {
    ({ to, from, subject, htmlBody, projectId, attachments: rawAttachments } = req.body || {});
  }

  if (!to || (Array.isArray(to) && to.length === 0)) {
    return res.status(400).json({ error: "To address is required" });
  }
  if (!from) {
    return res.status(400).json({ error: "From address is required" });
  }

  // Get SMTP credentials based on from_address
  const smtpCreds = await getSmtpCredentialsForFromAddress(from);
  let smtpUser = smtpCreds.smtpUser;
  let smtpPass = smtpCreds.smtpPass;

  if (!smtpUser || !smtpPass) {
    return res.status(503).json({
      error:
        "SMTP not configured. Set SMTP User and SMTP Pass in Settings → File Settings, or use backend .env.",
    });
  }

  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true";

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const rawBody = (htmlBody || "").trim().replace(/\n/g, "<br>");
    let htmlEmailBody = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">${rawBody}</body></html>`;

    // Add logo to email
    const logoResult = await addLogoToEmail(htmlEmailBody, []);
    htmlEmailBody = logoResult.htmlBody;

    // Prepare attachments array starting with logo
    let attachments = [...logoResult.attachments];

    // If projectId is provided, try to attach the proposal PDF
    if (projectId && pool) {
      try {
        const projectResult = await pool.query(
          "SELECT proposal_pdf_location FROM projects WHERE id = $1",
          [projectId]
        );

        if (projectResult.rows.length > 0) {
          const proposalPdfPath = projectResult.rows[0].proposal_pdf_location;
          
          if (proposalPdfPath) {
            // Check if file exists
            try {
              await fs.access(proposalPdfPath);
              // Read the PDF file
              const proposalBuffer = await fs.readFile(proposalPdfPath);
              const proposalFileName = proposalPdfPath.split("\\").pop() || proposalPdfPath.split("/").pop() || "Proposal.PDF";
              
              // Add proposal PDF to attachments
              attachments.push({
                filename: proposalFileName,
                content: proposalBuffer,
                contentType: "application/pdf",
              });
              
              console.log(`Proposal PDF attached: ${proposalPdfPath}`);
            } catch (fileError) {
              console.warn(`Proposal PDF file not found at ${proposalPdfPath}, skipping attachment`);
            }
          }
        }
      } catch (dbError) {
        console.error("Error fetching proposal PDF location:", dbError);
        // Continue without proposal PDF attachment
      }
    }

    // Optional client-provided attachments (base64), e.g. Hotlist Sold PDF
    if (Array.isArray(rawAttachments)) {
      for (const item of rawAttachments) {
        const filename = String(item?.filename || "").trim();
        const contentBase64 = String(item?.contentBase64 || "").trim();
        if (!filename || !contentBase64) continue;
        try {
          const contentBuffer = Buffer.from(contentBase64, "base64");
          if (!contentBuffer || contentBuffer.length === 0) continue;
          attachments.push({
            filename,
            content: contentBuffer,
            contentType: String(item?.contentType || "application/octet-stream"),
          });
        } catch {
          // Skip malformed attachment entries
        }
      }
    }

    if (req.file?.buffer?.length) {
      attachments.push({
        filename: req.file.originalname || "attachment.pdf",
        content: req.file.buffer,
        contentType: req.file.mimetype || "application/pdf",
      });
    }

    const mailOptions = {
      from: from,
      to: Array.isArray(to) ? to.join(", ") : to,
      subject: subject || "",
      html: htmlEmailBody,
      attachments: attachments,
    };

    const info = await transporter.sendMail(mailOptions);
    res.json({ success: true, messageId: info.messageId, message: "Email sent successfully!" });
  } catch (e) {
    console.error("Error sending email:", e);
    res.status(500).json({
      error: e.message || "Failed to send email. Check SMTP settings and credentials.",
    });
  }
});

/** Match `resolveRegionalSalespersonName` / `projectStateCode` in `frontend/src/utils/drawingNotifyFrom.js`. */
function drawingsEmailProjectStateCode(row) {
  const s = String(row?.state ?? "").trim().toUpperCase();
  if (s === "VIC" || s === "VICTORIA") return "VIC";
  if (s === "QLD" || s === "QUEENSLAND") return "QLD";
  return "";
}

function resolveRegionalSalespersonNameForDrawingsEmail(row) {
  const code = drawingsEmailProjectStateCode(row);
  if (code === "QLD") return "Brian Willis";
  if (code === "VIC") return "Ben Donnan";
  return String(row?.salesperson ?? "").trim();
}

/** Position for email tokens: primary position in Users, not alphabetical first (Admin). */
async function fetchSalespersonDetailsByNameForDrawingsEmail(pool, salespersonName) {
  const name = String(salespersonName || "").trim();
  if (!name) return { position: "", phone: "", email: "" };
  try {
    const r = await pool.query(
      `SELECT u.email, u.phone,
        COALESCE(
          (SELECT p.name FROM positions p WHERE p.id = u.primary_position_id),
          (SELECT p.name FROM positions p
           INNER JOIN user_positions up ON p.id = up.position_id
           WHERE up.user_id = u.id AND TRIM(p.name) <> 'Admin'
           ORDER BY p.name ASC LIMIT 1),
          (SELECT p.name FROM positions p
           INNER JOIN user_positions up ON p.id = up.position_id
           WHERE up.user_id = u.id
           ORDER BY p.name ASC LIMIT 1)
        ) AS position_name
       FROM users u
       WHERE LOWER(TRIM(u.name)) = LOWER(TRIM($1::text))
       LIMIT 1`,
      [name]
    );
    if (!r.rows.length) return { position: "", phone: "", email: "" };
    const row0 = r.rows[0];
    const position = String(row0.position_name || "").trim();
    return {
      position,
      phone: String(row0.phone || "").trim(),
      email: String(row0.email || "").trim(),
    };
  } catch (e) {
    console.error("fetchSalespersonDetailsByNameForDrawingsEmail:", e);
    return { position: "", phone: "", email: "" };
  }
}

async function applyDrawingsSalespersonTokenSubstitution(pool, htmlBody, subject, projectRow) {
  const h = String(htmlBody ?? "");
  const sub = subject == null ? "" : String(subject);
  const combined = `${h}\n${sub}`;
  if (
    !/\{Salesperson\}/.test(combined) &&
    !/\{SalespersonPosition\}/.test(combined) &&
    !/\{SalespersonPhone\}/.test(combined) &&
    !/\{SalespersonEmail\}/.test(combined)
  ) {
    return { html: h, subject: sub };
  }
  const salespersonName = resolveRegionalSalespersonNameForDrawingsEmail(projectRow);
  let html = h.replace(/\{Salesperson\}/g, salespersonName);
  let subjectOut = sub.replace(/\{Salesperson\}/g, salespersonName);
  const needDetails =
    /\{SalespersonPosition\}/.test(html + subjectOut) ||
    /\{SalespersonPhone\}/.test(html + subjectOut) ||
    /\{SalespersonEmail\}/.test(html + subjectOut);
  if (needDetails && salespersonName) {
    const { position, phone, email } = await fetchSalespersonDetailsByNameForDrawingsEmail(
      pool,
      salespersonName
    );
    const positionBody = position ? `<br>${position}` : "";
    html = html
      .replace(/\{SalespersonPosition\}/g, positionBody)
      .replace(/\{SalespersonPhone\}/g, phone || "")
      .replace(/\{SalespersonEmail\}/g, email || "");
    subjectOut = subjectOut
      .replace(/\{SalespersonPosition\}/g, position || "")
      .replace(/\{SalespersonPhone\}/g, phone || "")
      .replace(/\{SalespersonEmail\}/g, email || "");
  } else {
    html = html
      .replace(/\{SalespersonPosition\}/g, "")
      .replace(/\{SalespersonPhone\}/g, "")
      .replace(/\{SalespersonEmail\}/g, "");
    subjectOut = subjectOut
      .replace(/\{SalespersonPosition\}/g, "")
      .replace(/\{SalespersonPhone\}/g, "")
      .replace(/\{SalespersonEmail\}/g, "");
  }
  return { html, subject: subjectOut };
}

// Send drawings PDF via email with attachment
app.post("/api/emails/send-drawings", async (req, res) => {
  const { projectId, toEmail, attachDrawings, toEmails, customBody, from, subject: customSubject } = req.body || {};
  const attachPdf = attachDrawings !== false; // Default to true if not specified

  if (!projectId) {
    return res.status(400).json({ error: "Project ID is required" });
  }

  if (!pool) {
    return res.status(500).json({ error: "DATABASE_URL not set" });
  }

  // Get project details and drawings PDF location
  let project = null;
  let drawingsPdfPath = null;
  try {
    const projectResult = await pool.query(
      "SELECT suburb, street, state, salesperson, drawings_pdf_location FROM projects WHERE id = $1",
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    project = projectResult.rows[0];
    drawingsPdfPath = project.drawings_pdf_location;

    // Only check for PDF file if we need to attach it
    if (attachPdf) {
      if (!drawingsPdfPath) {
        return res.status(404).json({ error: "Drawings PDF not found for this project" });
      }

      // Check if file exists
      try {
        await fs.access(drawingsPdfPath);
      } catch (e) {
        return res.status(404).json({ error: "Drawings PDF file does not exist on disk" });
      }
    }
  } catch (e) {
    console.error("Error fetching project:", e);
    return res.status(500).json({ error: "Failed to fetch project details" });
  }

  const fromTrim = from != null ? String(from).trim() : "";
  if (!fromTrim) {
    return res.status(400).json({
      error: "From address is required. Configure it in Stream Settings and send again; the server does not guess a sender.",
    });
  }

  let recipientEmails = [];
  if (toEmails && Array.isArray(toEmails) && toEmails.length > 0) {
    recipientEmails = toEmails.map((email) => String(email || "").trim()).filter(Boolean);
  } else if (toEmail != null && String(toEmail).trim()) {
    recipientEmails = [String(toEmail).trim()];
  }
  if (recipientEmails.length === 0) {
    return res.status(400).json({
      error:
        "At least one recipient (toEmails or toEmail) is required. The server does not use a default recipient address.",
    });
  }

  const creds = await getSmtpCredentialsForFromAddress(fromTrim);
  let smtpUser = creds.smtpUser;
  let smtpPass = creds.smtpPass;

  if (!smtpUser || !smtpPass) {
    return res.status(503).json({
      error:
        "SMTP not configured. Set SMTP User and SMTP Pass in Settings → SMTP Settings, or use backend .env.",
    });
  }

  const fromAddress = fromTrim;

  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true";

  try {
    // Read the PDF file only if we need to attach it
    let fileBuffer = null;
    let fileName = null;
    if (attachPdf && drawingsPdfPath) {
      fileBuffer = await fs.readFile(drawingsPdfPath);
      fileName = drawingsPdfPath.split("\\").pop() || drawingsPdfPath.split("/").pop() || "drawings.pdf";
    }

    // Create email transporter
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: smtpUser, pass: smtpPass },
    });

    // Prepare email content
    const suburb = (project.suburb || "").toUpperCase();
    const street = project.street || "";
    
    // Use custom subject if provided, otherwise use default
    let subject =
      customSubject != null && String(customSubject).trim() !== ""
        ? String(customSubject)
        : `New Drawings - ${suburb} - ${street}`;
    
    // Use custom body if provided, otherwise build default body
    let htmlBody;
    if (customBody !== undefined && customBody !== null) {
      htmlBody = customBody.toString();
      
      // Only add "View Drawings" button for Drafting Notes emails (Preview & Send Email modal)
      // Do NOT add it for "Email Drawings to Client" emails (when attachDrawings is true)
      if (attachPdf === false) {
        // Add button link to drawings page directly after the notes
        const emailBase = await resolveEmailAppPublicBase(pool, req, req.body);
        const projectAccessToken = await getProjectAccessTokenById(pool, projectId);
        if (!projectAccessToken) {
          throw new Error("Project access token not found");
        }
        const drawingsUrl = `${emailBase}/project/${projectAccessToken}?view=drawings`;
        const buttonHtml = `
          <br><br>
          <div style="text-align: left; margin: 20px 0;">
            <a href="${drawingsUrl}" style="
              display: inline-block;
              padding: 16px 32px;
              background-color: #4D93D9;
              color: #ffffff;
              text-decoration: none;
              border-radius: 8px;
              font-weight: 500;
              font-size: 1.1rem;
            ">View Drawings</a>
          </div>
        `;
        
        // Find where the notes section ends and insert button right after it
        // Look for patterns that come after the notes: {Draftsperson}, {Position}, or "Powered by"
        let buttonInserted = false;
        
        // Find the position right before {Draftsperson} or {Position} tokens
        // These tokens come after the notes section
        const afterNotesPatterns = [
          /{Draftsperson}/i,
          /{Position}/i,
          /<b>.*?<\/b>\s*Powered by/i,
          /Powered by SGF Central/i
        ];
        
        for (const pattern of afterNotesPatterns) {
          const match = htmlBody.match(pattern);
          if (match) {
            // Insert button right before this pattern
            const insertIndex = match.index;
            htmlBody = htmlBody.slice(0, insertIndex) + buttonHtml + htmlBody.slice(insertIndex);
            buttonInserted = true;
            break;
          }
        }
        
        // Fallback: if we can't find the pattern, append at the end
        if (!buttonInserted) {
          htmlBody += buttonHtml;
        }
      }
    } else {
      // Build default email body with optional notes
      const { notes } = req.body || {};
      htmlBody = `New Drawings for ${suburb} - ${street}`;
      if (notes && notes.trim()) {
        htmlBody += `<br><br>${notes.trim().replace(/\n/g, "<br>")}`;
      }
      htmlBody += `<br><br>SGF CENTRAL`;
    }

    const spTokens = await applyDrawingsSalespersonTokenSubstitution(pool, htmlBody, subject, project);
    htmlBody = spTokens.html;
    subject = spTokens.subject;

    const recipientEmail = recipientEmails.join(", ");
    
    // fromAddress is already set above based on the "from" parameter and matching SMTP credentials

    // Prepare attachments array
    const emailAttachments = [];
    
    // Only attach PDF if requested
    if (attachPdf && drawingsPdfPath && fileBuffer) {
      emailAttachments.push({
        filename: fileName,
        content: fileBuffer,
        contentType: "application/pdf",
      });
    }

    // Add logo to email
    const logoResult = await addLogoToEmail(htmlBody, emailAttachments);

    const mailOptions = {
      from: fromAddress,
      to: recipientEmail,
      subject: subject,
      html: logoResult.htmlBody,
      attachments: logoResult.attachments,
    };

    const info = await transporter.sendMail(mailOptions);
    res.json({ success: true, messageId: info.messageId, message: "Drawings email sent successfully!" });
  } catch (e) {
    console.error("Error sending drawings email:", e);
    res.status(500).json({
      error: e.message || "Failed to send email. Check SMTP settings and credentials.",
    });
  }
});

// Send colours PDFs via email with attachments
app.post("/api/emails/send-colours", async (req, res) => {
  const { projectId, attachAffordable, attachSuperior, toEmails, customBody, from } = req.body || {};

  if (!projectId) {
    return res.status(400).json({ error: "Project ID is required" });
  }

  if (!pool) {
    return res.status(500).json({ error: "DATABASE_URL not set" });
  }

  // Get project details including client names
  let project = null;
  try {
    const projectResult = await pool.query(
      "SELECT suburb, street, state, client1_name, client1_active, client2_name, client2_active, client3_name, client3_active, draftsperson FROM projects WHERE id = $1",
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    project = projectResult.rows[0];
  } catch (e) {
    console.error("Error fetching project:", e);
    return res.status(500).json({ error: "Failed to fetch project details" });
  }

  // Get settings for colour attachments path and SMTP
  let colourAttachmentsPath = null;
  let smtpUser = null;
  let smtpPass = null;
  try {
    const settingsResult = await pool.query(
      "SELECT colour_attachments_vic, colour_attachments_qld, smtp_user_1, smtp_pass_1 FROM settings WHERE id = 1"
    );
    
    if (settingsResult.rows.length > 0) {
      const settings = settingsResult.rows[0];
      // Use VIC or QLD path based on project state
      if (project.state === "VIC") {
        colourAttachmentsPath = settings.colour_attachments_vic;
      } else if (project.state === "QLD") {
        colourAttachmentsPath = settings.colour_attachments_qld;
      }
      
      smtpUser = settings.smtp_user_1;
      smtpPass = settings.smtp_pass_1;
    }
  } catch (e) {
    console.error("Error reading settings:", e);
    return res.status(500).json({ error: "Failed to fetch settings" });
  }

  if (!colourAttachmentsPath) {
    return res.status(400).json({ 
      error: `Colour attachments path not configured for ${project.state || "this state"}. Please set it in Settings → File Settings.` 
    });
  }

  // Get email template by name
  let template = null;
  try {
    const templateResult = await pool.query(
      "SELECT id, name, to_addresses, from_address, subject, body FROM email_templates WHERE name = $1",
      ["COLOURS - Send"]
    );
    
    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Email template "COLOURS - Send" not found. Please create it in Settings → Email Templates.' });
    }
    
    try {
      template = {
        ...templateResult.rows[0],
        to_addresses: templateResult.rows[0].to_addresses ? JSON.parse(templateResult.rows[0].to_addresses) : []
      };
    } catch (parseError) {
      console.error("Error parsing template to_addresses:", parseError);
      template = {
        ...templateResult.rows[0],
        to_addresses: []
      };
    }
  } catch (e) {
    console.error("Error fetching email template:", e);
    return res.status(500).json({ error: `Failed to fetch email template: ${e.message}` });
  }

  // Get Colour Consultant name(s)
  let colourConsultantName = "";
  try {
    const consultantResult = await pool.query(
      `SELECT DISTINCT u.name 
       FROM users u
       INNER JOIN user_positions up ON u.id = up.user_id
       INNER JOIN positions p ON up.position_id = p.id
       WHERE LOWER(TRIM(p.name)) = LOWER(TRIM($1))
       ORDER BY u.name ASC`,
      ["Colour Consultant"]
    );
    
    if (consultantResult.rows.length > 0) {
      const consultantNames = consultantResult.rows.map(row => row.name.trim()).filter(name => name);
      if (consultantNames.length === 1) {
        colourConsultantName = consultantNames[0];
      } else if (consultantNames.length > 1) {
        // Multiple consultants: "Name1, Name2 & Name3"
        if (consultantNames.length === 2) {
          colourConsultantName = `${consultantNames[0]} & ${consultantNames[1]}`;
        } else {
          const allButLast = consultantNames.slice(0, -1).join(", ");
          const last = consultantNames[consultantNames.length - 1];
          colourConsultantName = `${allButLast} & ${last}`;
        }
      }
    }
  } catch (e) {
    console.error("Error fetching Colour Consultant:", e);
    // Don't fail if we can't find consultant, just leave token as empty string
  }

  // Build attachment paths
  // Normalize the path (handle trailing slashes/backslashes)
  const normalizedPath = colourAttachmentsPath.replace(/[\/\\]+$/, "");
  const attachments = [];
  
  if (attachAffordable) {
    const affordablePath = path.join(normalizedPath, "COLOR_AFFORDABLE.pdf");
    console.log(`Attempting to read COLOR_AFFORDABLE.pdf from: ${affordablePath}`);
    try {
      await fs.access(affordablePath);
      const fileBuffer = await fs.readFile(affordablePath);
      attachments.push({
        filename: "COLOR_AFFORDABLE.pdf",
        content: fileBuffer,
        contentType: "application/pdf",
      });
      console.log(`Successfully loaded COLOR_AFFORDABLE.pdf`);
    } catch (e) {
      console.error(`Error reading COLOR_AFFORDABLE.pdf: ${e.message}`, e);
      return res.status(404).json({ error: `COLOR_AFFORDABLE.pdf not found at ${affordablePath}. Error: ${e.message}` });
    }
  }

  if (attachSuperior) {
    const superiorPath = path.join(normalizedPath, "COLOR_SUPERIOR.pdf");
    console.log(`Attempting to read COLOR_SUPERIOR.pdf from: ${superiorPath}`);
    try {
      await fs.access(superiorPath);
      const fileBuffer = await fs.readFile(superiorPath);
      attachments.push({
        filename: "COLOR_SUPERIOR.pdf",
        content: fileBuffer,
        contentType: "application/pdf",
      });
      console.log(`Successfully loaded COLOR_SUPERIOR.pdf`);
    } catch (e) {
      console.error(`Error reading COLOR_SUPERIOR.pdf: ${e.message}`, e);
      return res.status(404).json({ error: `COLOR_SUPERIOR.pdf not found at ${superiorPath}. Error: ${e.message}` });
    }
  }

  if (attachments.length === 0) {
    return res.status(400).json({ error: "At least one attachment must be selected" });
  }

  // Get SMTP credentials based on template's from_address
  // For QLD projects, use QLD SMTP; for VIC projects, use from_address to determine primary/secondary
  if (project.state === "QLD") {
    try {
      const qldSettingsResult = await pool.query(
        `SELECT smtp_user_${SMTP_SLOT_QLD} AS u, smtp_pass_${SMTP_SLOT_QLD} AS p FROM settings WHERE id = 1`
      );
      if (qldSettingsResult.rows[0]?.u && qldSettingsResult.rows[0]?.p) {
        smtpUser = qldSettingsResult.rows[0].u;
        smtpPass = qldSettingsResult.rows[0].p;
      }
    } catch (e) {
      console.error("Error reading QLD SMTP from settings:", e);
    }
  } else {
    // VIC project - use from_address to determine which SMTP to use
    const fromAddress = template.from_address;
    const smtpCreds = await getSmtpCredentialsForFromAddress(fromAddress);
    smtpUser = smtpCreds.smtpUser;
    smtpPass = smtpCreds.smtpPass;
  }

  if (!smtpUser || !smtpPass) {
    smtpUser = process.env.SMTP_USER;
    smtpPass = process.env.SMTP_PASS;
  }
  if (!smtpUser || !smtpPass) {
    return res.status(503).json({
      error:
        "SMTP not configured. Set SMTP User and SMTP Pass in Settings → File Settings, or use backend .env.",
    });
  }

  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true";

  try {
    // Create email transporter
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: smtpUser, pass: smtpPass },
    });

    // Prepare email content from template
    const suburb = (project.suburb || "").toUpperCase();
    const street = project.street || "";
    
    // Get active client names (first names only)
    const activeClientFirstNames = [];
    if (project.client1_active === true || project.client1_active === 'true') {
      if (project.client1_name && project.client1_name.trim()) {
        const firstName = project.client1_name.trim().split(/\s+/)[0]; // Get first word
        if (firstName) activeClientFirstNames.push(firstName);
      }
    }
    if (project.client2_active === true || project.client2_active === 'true') {
      if (project.client2_name && project.client2_name.trim()) {
        const firstName = project.client2_name.trim().split(/\s+/)[0]; // Get first word
        if (firstName) activeClientFirstNames.push(firstName);
      }
    }
    if (project.client3_active === true || project.client3_active === 'true') {
      if (project.client3_name && project.client3_name.trim()) {
        const firstName = project.client3_name.trim().split(/\s+/)[0]; // Get first word
        if (firstName) activeClientFirstNames.push(firstName);
      }
    }
    
    // Format client first names with commas and "&"
    let clientName = "";
    if (activeClientFirstNames.length === 0) {
      clientName = ""; // No active clients
    } else if (activeClientFirstNames.length === 1) {
      clientName = activeClientFirstNames[0];
    } else if (activeClientFirstNames.length === 2) {
      clientName = `${activeClientFirstNames[0]} & ${activeClientFirstNames[1]}`;
    } else {
      // 3 or more: "Name1, Name2 & Name3"
      const allButLast = activeClientFirstNames.slice(0, -1).join(", ");
      const last = activeClientFirstNames[activeClientFirstNames.length - 1];
      clientName = `${allButLast} & ${last}`;
    }
    
    // Format project name: "<Street>, <Suburb>"
    const projectName = `${street || ""}, ${suburb || ""}`.trim().replace(/^,\s*|,\s*$/g, "");
    
    const draftspersonName = draftspersonTokenDisplay(project.draftsperson);
    
    // Replace template variables in subject and body
    let subject = (template.subject || "").toString();
    // Use customBody if provided, otherwise use template body
    let htmlBody = (customBody !== undefined && customBody !== null) ? customBody.toString() : (template.body || "").toString();
    
    // Replace common placeholders
    subject = subject.replace(/\{SUBURB\}/g, suburb)
                     .replace(/\{STREET\}/g, street)
                     .replace(/\{ClientName\}/g, clientName)
                     .replace(/\{ProjectName\}/g, projectName)
                     .replace(/\{ColourConsultant\}/g, colourConsultantName)
                     .replace(/\{Draftsperson\}/g, draftspersonName)
                     .replace(/\{DRAFTSPERSON\}/g, draftspersonName);
    // Only replace tokens in htmlBody if customBody was not provided (to avoid double replacement)
    if (customBody === undefined || customBody === null) {
      htmlBody = htmlBody.replace(/\{SUBURB\}/g, suburb)
                         .replace(/\{STREET\}/g, street)
                         .replace(/\{ClientName\}/g, clientName)
                         .replace(/\{ProjectName\}/g, projectName)
                         .replace(/\{ColourConsultant\}/g, colourConsultantName)
                         .replace(/\{Draftsperson\}/g, draftspersonName)
                         .replace(/\{DRAFTSPERSON\}/g, draftspersonName);
    }
    
    // Convert newlines to HTML breaks
    htmlBody = htmlBody.replace(/\n/g, "<br>");
    
    // Wrap in HTML structure if not already HTML
    if (!htmlBody.includes("<html") && !htmlBody.includes("<!DOCTYPE")) {
      htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">${htmlBody}</body></html>`;
    }

    const fromTrim = from != null ? String(from).trim() : "";
    if (!fromTrim) {
      return res.status(400).json({
        error: "From address is required in the request body. The server does not use the template From field or SMTP user as a fallback.",
      });
    }

    let recipientEmails = [];
    if (toEmails && Array.isArray(toEmails) && toEmails.length > 0) {
      recipientEmails = toEmails.map((email) => String(email || "").trim()).filter(Boolean);
    }
    if (recipientEmails.length === 0) {
      return res.status(400).json({
        error: "No valid recipient email addresses in toEmails. The server does not fall back to template To addresses.",
      });
    }

    const recipientEmail = recipientEmails.join(", ");
    const fromAddress = fromTrim;

    // Add logo to email (logo will be added to existing attachments array)
    const logoResult = await addLogoToEmail(htmlBody, attachments);
    
    const mailOptions = {
      from: fromAddress,
      to: recipientEmail,
      subject: subject,
      html: logoResult.htmlBody,
      attachments: logoResult.attachments,
    };

    console.log(`Sending colours email from: ${fromAddress}`);
    console.log(`Sending colours email to: ${recipientEmail}`);
    console.log(`Subject: ${subject}`);
    console.log(`Attachments: ${attachments.length} file(s)`);
    
    // Verify SMTP connection before sending
    try {
      await transporter.verify();
      console.log("SMTP connection verified successfully");
    } catch (verifyError) {
      console.error("SMTP verification failed:", verifyError);
      return res.status(500).json({
        error: `SMTP connection failed: ${verifyError.message || verifyError}`,
        details: verifyError.response || verifyError.code,
      });
    }
    
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully. Message ID: ${info.messageId}`);
    
    // Add project log entry
    try {
      const now = new Date();
      const dateTimeStr = now.toISOString().replace('T', ' ').substring(0, 19);
      const attachmentsList = [];
      if (attachAffordable) attachmentsList.push("Affordable");
      if (attachSuperior) attachmentsList.push("Superior");
      const attachmentsText = attachmentsList.length > 0 ? ` - ${attachmentsList.join(", ")}` : "";
      const logEntry = `Colours Email Sent${attachmentsText} - ${dateTimeStr}`;
      
      // Get current project log
      const projectLogResult = await pool.query(
        "SELECT project_log FROM projects WHERE id = $1",
        [projectId]
      );
      
      const currentLog = projectLogResult.rows[0]?.project_log || "";
      const newLog = currentLog ? `${currentLog}\n${logEntry}` : logEntry;
      
      // Update project log and colours_sent_date
      await pool.query(
        "UPDATE projects SET project_log = $1, colours_sent_date = $2 WHERE id = $3",
        [newLog, dateTimeStr, projectId]
      );
      
      console.log(`Project log and colours_sent_date updated for project ${projectId}`);
    } catch (logError) {
      console.error("Error updating project log:", logError);
      // Don't fail the request if log update fails
    }
    
    res.json({ success: true, messageId: info.messageId, message: "Colours email sent successfully!" });
  } catch (e) {
    console.error("Error sending colours email:", e);
    console.error("Error stack:", e.stack);
    
    // Extract more detailed error information from nodemailer
    let errorMessage = e.message || "Failed to send email. Check SMTP settings and credentials.";
    let errorDetails = null;
    
    if (e.response) {
      errorDetails = e.response;
      errorMessage += ` Response: ${e.response}`;
    }
    if (e.responseCode) {
      errorDetails = { code: e.responseCode, response: e.response };
      errorMessage += ` Code: ${e.responseCode}`;
    }
    if (e.command) {
      errorMessage += ` Command: ${e.command}`;
    }
    
    res.status(500).json({
      error: errorMessage,
      details: errorDetails || (process.env.NODE_ENV === "development" ? e.stack : undefined),
    });
  }
});

// Send colours reminder email - identical to send-colours but uses "COLOURS - Remind" template
app.post("/api/emails/send-colours-reminder", async (req, res) => {
  const { projectId, attachAffordable, attachSuperior, toEmails, customBody, from } = req.body || {};

  if (!projectId) {
    return res.status(400).json({ error: "Project ID is required" });
  }

  if (!pool) {
    return res.status(500).json({ error: "DATABASE_URL not set" });
  }

  // Get project details including client names
  let project = null;
  try {
    const projectResult = await pool.query(
      "SELECT suburb, street, state, client1_name, client1_active, client2_name, client2_active, client3_name, client3_active, draftsperson FROM projects WHERE id = $1",
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    project = projectResult.rows[0];
  } catch (e) {
    console.error("Error fetching project:", e);
    return res.status(500).json({ error: "Failed to fetch project details" });
  }

  // Get settings for colour attachments path and SMTP
  let colourAttachmentsPath = null;
  let smtpUser = null;
  let smtpPass = null;
  try {
    const settingsResult = await pool.query(
      "SELECT colour_attachments_vic, colour_attachments_qld, smtp_user_1, smtp_pass_1 FROM settings WHERE id = 1"
    );
    
    if (settingsResult.rows.length > 0) {
      const settings = settingsResult.rows[0];
      // Use VIC or QLD path based on project state
      if (project.state === "VIC") {
        colourAttachmentsPath = settings.colour_attachments_vic;
      } else if (project.state === "QLD") {
        colourAttachmentsPath = settings.colour_attachments_qld;
      }
      
      smtpUser = settings.smtp_user_1;
      smtpPass = settings.smtp_pass_1;
    }
  } catch (e) {
    console.error("Error reading settings:", e);
    return res.status(500).json({ error: "Failed to fetch settings" });
  }

  if (!colourAttachmentsPath) {
    return res.status(400).json({ 
      error: `Colour attachments path not configured for ${project.state || "this state"}. Please set it in Settings → File Settings.` 
    });
  }

  // Get email template by name - use "COLOURS - Remind"
  let template = null;
  try {
    const templateResult = await pool.query(
      "SELECT id, name, to_addresses, from_address, subject, body FROM email_templates WHERE name = $1",
      ["COLOURS - Remind"]
    );
    
    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Email template "COLOURS - Remind" not found. Please create it in Settings → Email Templates.' });
    }
    
    try {
      template = {
        ...templateResult.rows[0],
        to_addresses: templateResult.rows[0].to_addresses ? JSON.parse(templateResult.rows[0].to_addresses) : []
      };
    } catch (parseError) {
      console.error("Error parsing template to_addresses:", parseError);
      template = {
        ...templateResult.rows[0],
        to_addresses: []
      };
    }
  } catch (e) {
    console.error("Error fetching email template:", e);
    return res.status(500).json({ error: `Failed to fetch email template: ${e.message}` });
  }

  // Get Colour Consultant name(s)
  let colourConsultantName = "";
  try {
    const consultantResult = await pool.query(
      `SELECT DISTINCT u.name 
       FROM users u
       INNER JOIN user_positions up ON u.id = up.user_id
       INNER JOIN positions p ON up.position_id = p.id
       WHERE LOWER(TRIM(p.name)) = LOWER(TRIM($1))
       ORDER BY u.name ASC`,
      ["Colour Consultant"]
    );
    
    if (consultantResult.rows.length > 0) {
      const consultantNames = consultantResult.rows.map(row => row.name.trim()).filter(name => name);
      if (consultantNames.length === 1) {
        colourConsultantName = consultantNames[0];
      } else if (consultantNames.length > 1) {
        // Multiple consultants: "Name1, Name2 & Name3"
        if (consultantNames.length === 2) {
          colourConsultantName = `${consultantNames[0]} & ${consultantNames[1]}`;
        } else {
          const allButLast = consultantNames.slice(0, -1).join(", ");
          const last = consultantNames[consultantNames.length - 1];
          colourConsultantName = `${allButLast} & ${last}`;
        }
      }
    }
  } catch (e) {
    console.error("Error fetching Colour Consultant:", e);
    // Don't fail if we can't find consultant, just leave token as empty string
  }

  // Build attachment paths
  // Normalize the path (handle trailing slashes/backslashes)
  const normalizedPath = colourAttachmentsPath.replace(/[\/\\]+$/, "");
  const attachments = [];
  
  if (attachAffordable) {
    const affordablePath = path.join(normalizedPath, "COLOR_AFFORDABLE.pdf");
    console.log(`Attempting to read COLOR_AFFORDABLE.pdf from: ${affordablePath}`);
    try {
      await fs.access(affordablePath);
      const fileBuffer = await fs.readFile(affordablePath);
      attachments.push({
        filename: "COLOR_AFFORDABLE.pdf",
        content: fileBuffer,
        contentType: "application/pdf",
      });
      console.log(`Successfully loaded COLOR_AFFORDABLE.pdf`);
    } catch (e) {
      console.error(`Error reading COLOR_AFFORDABLE.pdf: ${e.message}`, e);
      return res.status(404).json({ error: `COLOR_AFFORDABLE.pdf not found at ${affordablePath}. Error: ${e.message}` });
    }
  }

  if (attachSuperior) {
    const superiorPath = path.join(normalizedPath, "COLOR_SUPERIOR.pdf");
    console.log(`Attempting to read COLOR_SUPERIOR.pdf from: ${superiorPath}`);
    try {
      await fs.access(superiorPath);
      const fileBuffer = await fs.readFile(superiorPath);
      attachments.push({
        filename: "COLOR_SUPERIOR.pdf",
        content: fileBuffer,
        contentType: "application/pdf",
      });
      console.log(`Successfully loaded COLOR_SUPERIOR.pdf`);
    } catch (e) {
      console.error(`Error reading COLOR_SUPERIOR.pdf: ${e.message}`, e);
      return res.status(404).json({ error: `COLOR_SUPERIOR.pdf not found at ${superiorPath}. Error: ${e.message}` });
    }
  }

  if (attachments.length === 0) {
    return res.status(400).json({ error: "At least one attachment must be selected" });
  }

  // Get SMTP credentials based on template's from_address
  // For QLD projects, use QLD SMTP; for VIC projects, use from_address to determine primary/secondary
  if (project.state === "QLD") {
    // QLD projects use SMTP slot 4 (legacy smtp_user_qld)
    try {
      const settingsResult = await pool.query(
        `SELECT smtp_user_${SMTP_SLOT_QLD} AS u, smtp_pass_${SMTP_SLOT_QLD} AS p FROM settings WHERE id = 1`
      );
      if (settingsResult.rows.length > 0 && settingsResult.rows[0].u && settingsResult.rows[0].p) {
        smtpUser = settingsResult.rows[0].u;
        smtpPass = settingsResult.rows[0].p;
      }
    } catch (e) {
      console.error("Error reading QLD SMTP from settings:", e);
    }
  } else {
    // VIC project - use from_address to determine which SMTP to use
    const fromAddress = template.from_address;
    const smtpCreds = await getSmtpCredentialsForFromAddress(fromAddress);
    smtpUser = smtpCreds.smtpUser;
    smtpPass = smtpCreds.smtpPass;
  }

  if (!smtpUser || !smtpPass) {
    smtpUser = process.env.SMTP_USER;
    smtpPass = process.env.SMTP_PASS;
  }
  if (!smtpUser || !smtpPass) {
    return res.status(503).json({
      error:
        "SMTP not configured. Set SMTP User and SMTP Pass in Settings → File Settings, or use backend .env.",
    });
  }

  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true";

  try {
    // Create email transporter
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: smtpUser, pass: smtpPass },
    });

    // Prepare email content from template
    const suburb = (project.suburb || "").toUpperCase();
    const street = project.street || "";
    
    // Get active client names (first names only)
    const activeClientFirstNames = [];
    if (project.client1_active === true || project.client1_active === 'true') {
      if (project.client1_name && project.client1_name.trim()) {
        const firstName = project.client1_name.trim().split(/\s+/)[0]; // Get first word
        if (firstName) activeClientFirstNames.push(firstName);
      }
    }
    if (project.client2_active === true || project.client2_active === 'true') {
      if (project.client2_name && project.client2_name.trim()) {
        const firstName = project.client2_name.trim().split(/\s+/)[0]; // Get first word
        if (firstName) activeClientFirstNames.push(firstName);
      }
    }
    if (project.client3_active === true || project.client3_active === 'true') {
      if (project.client3_name && project.client3_name.trim()) {
        const firstName = project.client3_name.trim().split(/\s+/)[0]; // Get first word
        if (firstName) activeClientFirstNames.push(firstName);
      }
    }
    
    // Format client first names with commas and "&"
    let clientName = "";
    if (activeClientFirstNames.length === 0) {
      clientName = ""; // No active clients
    } else if (activeClientFirstNames.length === 1) {
      clientName = activeClientFirstNames[0];
    } else if (activeClientFirstNames.length === 2) {
      clientName = `${activeClientFirstNames[0]} & ${activeClientFirstNames[1]}`;
    } else {
      // 3 or more: "Name1, Name2 & Name3"
      const allButLast = activeClientFirstNames.slice(0, -1).join(", ");
      const last = activeClientFirstNames[activeClientFirstNames.length - 1];
      clientName = `${allButLast} & ${last}`;
    }
    
    // Format project name: "<Street>, <Suburb>"
    const projectName = `${street || ""}, ${suburb || ""}`.trim().replace(/^,\s*|,\s*$/g, "");
    
    const draftspersonName = draftspersonTokenDisplay(project.draftsperson);
    
    // Replace template variables in subject and body
    let subject = (template.subject || "").toString();
    // Use customBody if provided, otherwise use template body
    let htmlBody = (customBody !== undefined && customBody !== null) ? customBody.toString() : (template.body || "").toString();
    
    // Replace common placeholders
    subject = subject.replace(/\{SUBURB\}/g, suburb)
                     .replace(/\{STREET\}/g, street)
                     .replace(/\{ClientName\}/g, clientName)
                     .replace(/\{ProjectName\}/g, projectName)
                     .replace(/\{ColourConsultant\}/g, colourConsultantName)
                     .replace(/\{Draftsperson\}/g, draftspersonName)
                     .replace(/\{DRAFTSPERSON\}/g, draftspersonName);
    // Only replace tokens in htmlBody if customBody was not provided (to avoid double replacement)
    if (customBody === undefined || customBody === null) {
      htmlBody = htmlBody.replace(/\{SUBURB\}/g, suburb)
                         .replace(/\{STREET\}/g, street)
                         .replace(/\{ClientName\}/g, clientName)
                         .replace(/\{ProjectName\}/g, projectName)
                         .replace(/\{ColourConsultant\}/g, colourConsultantName)
                         .replace(/\{Draftsperson\}/g, draftspersonName)
                         .replace(/\{DRAFTSPERSON\}/g, draftspersonName);
    }
    
    // Convert newlines to HTML breaks
    htmlBody = htmlBody.replace(/\n/g, "<br>");
    
    // Wrap in HTML structure if not already HTML
    if (!htmlBody.includes("<html") && !htmlBody.includes("<!DOCTYPE")) {
      htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">${htmlBody}</body></html>`;
    }

    const fromTrim = from != null ? String(from).trim() : "";
    if (!fromTrim) {
      return res.status(400).json({
        error: "From address is required in the request body. The server does not use the template From field or SMTP user as a fallback.",
      });
    }

    let recipientEmails = [];
    if (toEmails && Array.isArray(toEmails) && toEmails.length > 0) {
      recipientEmails = toEmails.map((email) => String(email || "").trim()).filter(Boolean);
    }
    if (recipientEmails.length === 0) {
      return res.status(400).json({
        error: "No valid recipient email addresses in toEmails. The server does not fall back to template To addresses.",
      });
    }

    const recipientEmail = recipientEmails.join(", ");
    const fromAddress = fromTrim;

    // Add logo to email (logo will be added to existing attachments array)
    const logoResult = await addLogoToEmail(htmlBody, attachments);
    
    const mailOptions = {
      from: fromAddress,
      to: recipientEmail,
      subject: subject,
      html: logoResult.htmlBody,
      attachments: logoResult.attachments,
    };

    console.log(`Sending colours reminder email from: ${fromAddress}`);
    console.log(`Sending colours reminder email to: ${recipientEmail}`);
    console.log(`Subject: ${subject}`);
    console.log(`Attachments: ${attachments.length} file(s)`);
    
    // Verify SMTP connection before sending
    try {
      await transporter.verify();
      console.log("SMTP connection verified successfully");
    } catch (verifyError) {
      console.error("SMTP verification failed:", verifyError);
      return res.status(500).json({
        error: `SMTP connection failed: ${verifyError.message || verifyError}`,
        details: verifyError.response || verifyError.code,
      });
    }
    
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully. Message ID: ${info.messageId}`);
    
    // Add project log entry and update colours_reminder_sent_date
    try {
      const now = new Date();
      const dateTimeStr = now.toISOString().replace('T', ' ').substring(0, 19);
      const attachmentsList = [];
      if (attachAffordable) attachmentsList.push("Affordable");
      if (attachSuperior) attachmentsList.push("Superior");
      const attachmentsText = attachmentsList.length > 0 ? ` - ${attachmentsList.join(", ")}` : "";
      const logEntry = `Colours Reminder Email Sent${attachmentsText} - ${dateTimeStr}`;
      
      // Get current project log
      const projectLogResult = await pool.query(
        "SELECT project_log FROM projects WHERE id = $1",
        [projectId]
      );
      
      const currentLog = projectLogResult.rows[0]?.project_log || "";
      const newLog = currentLog ? `${currentLog}\n${logEntry}` : logEntry;
      
      // Update project log and colours_reminder_sent_date
      await pool.query(
        "UPDATE projects SET project_log = $1, colours_reminder_sent_date = $2 WHERE id = $3",
        [newLog, dateTimeStr, projectId]
      );
      
      console.log(`Project log and colours_reminder_sent_date updated for project ${projectId}`);
    } catch (logError) {
      console.error("Error updating project log:", logError);
      // Don't fail the request if log update fails
    }
    
    res.json({ success: true, messageId: info.messageId, message: "Colours reminder email sent successfully!" });
  } catch (e) {
    console.error("Error in POST /api/emails/send-colours-reminder:", e);
    console.error("Error stack:", e.stack);
    
    // Extract more detailed error information from nodemailer
    let errorMessage = e.message || "Failed to send email. Check SMTP settings and credentials.";
    let errorDetails = null;
    
    if (e.response) {
      errorDetails = e.response;
      errorMessage += ` Response: ${e.response}`;
    }
    if (e.responseCode) {
      errorDetails = { code: e.responseCode, response: e.response };
      errorMessage += ` Code: ${e.responseCode}`;
    }
    if (e.command) {
      errorMessage += ` Command: ${e.command}`;
    }
    
    res.status(500).json({
      error: errorMessage,
      details: errorDetails || (process.env.NODE_ENV === "development" ? e.stack : undefined),
    });
  }
});

// Helper function to copy directory recursively
async function copyDirectory(src, dest) {
  try {
    // Check if source exists
    await fs.access(src);
    
    // Create destination directory
    await fs.mkdir(dest, { recursive: true });
    
    // Read source directory contents
    const entries = await fs.readdir(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively copy subdirectories
        await copyDirectory(srcPath, destPath);
      } else {
        // Copy files
        await fs.copyFile(srcPath, destPath);
      }
    }
  } catch (e) {
    throw new Error(`Failed to copy directory: ${e.message}`);
  }
}

/** Matches frontend `CLASSIFICATION_OPTIONS` value for renovation-only jobs. */
const CLASSIFICATION_RENOVATION = "Renovation";
const RENOVATION_PROPOSAL_SUBFOLDER = "12. RENOVATION";

function normalizeWindowsProjectPath(projectPath) {
  let normalized = path.normalize(String(projectPath || "").trim());
  if (/^[A-Za-z]:[^\\]/i.test(normalized)) {
    normalized = normalized.replace(/^([A-Za-z]:)([^\\])/, "$1\\$2");
  }
  return normalized;
}

// Create folder and copy template
app.post("/api/folders/create", async (req, res) => {
  try {
    const { path: folderPath, rootDirectory, year, state } = req.body || {};
    if (!folderPath) {
      return res.status(400).json({ error: "path required" });
    }

    console.log(`Received folder creation request:`);
    console.log(`  Raw path (as received):`, folderPath);
    console.log(`  Raw path (JSON):`, JSON.stringify(folderPath));
    console.log(`  Root directory:`, rootDirectory);
    console.log(`  Year:`, year);

    // Normalize paths to handle different path separators
    // On Windows, normalize will convert forward slashes to backslashes
    let folderPathNormalized = normalizeAddressHyphensForFilesystem(path.normalize(folderPath));
    
    // Fix Windows drive letter paths - ensure there's a backslash after the colon
    // e.g., "Z\path" should become "Z:\path"
    if (/^[A-Z]:[^\\]/.test(folderPathNormalized)) {
      folderPathNormalized = folderPathNormalized.replace(/^([A-Z]:)([^\\])/, '$1\\$2');
      console.log(`  Fixed drive letter path:`, folderPathNormalized);
    }
    
    console.log(`  Normalized path:`, folderPathNormalized);
    console.log(`  Normalized path (JSON):`, JSON.stringify(folderPathNormalized));
    
    // Verify it's an absolute path
    const isAbsolute = path.isAbsolute(folderPathNormalized);
    console.log(`  Is absolute path:`, isAbsolute);
    if (!isAbsolute) {
      console.warn(`  WARNING: Path is not absolute! Current working directory:`, process.cwd());
    }
    
    // Check if the project folder already exists
    let folderExists = false;
    try {
      const stats = await fs.stat(folderPathNormalized);
      if (stats.isDirectory()) {
        folderExists = true;
        // Check if folder is empty or has content
        const entries = await fs.readdir(folderPathNormalized);
        if (entries.length > 0) {
          // Folder exists and has content, don't overwrite or copy template
          console.log(`Project folder already exists with content: ${folderPathNormalized}`);
          return res.json({ success: true, path: folderPathNormalized, message: "Folder already exists" });
        }
      }
    } catch (e) {
      // Folder doesn't exist, we'll create it
      folderExists = false;
      console.log(`Folder doesn't exist yet, will create: ${folderPathNormalized}`);
    }

    // Create directory recursively (fs.mkdir with recursive: true won't create duplicates of existing directories)
    // It will only create directories that don't exist
    console.log(`Attempting to create folder: ${folderPathNormalized}`);
    await fs.mkdir(folderPathNormalized, { recursive: true });
    console.log(`mkdir() completed for: ${folderPathNormalized}`);
    
    // Verify the folder was created
    try {
      const stats = await fs.stat(folderPathNormalized);
      if (!stats.isDirectory()) {
        throw new Error("Created path exists but is not a directory");
      }
      console.log(`✓ Verified folder exists and is a directory: ${folderPathNormalized}`);
      
      // List parent directory to see what's there
      const parentDir = path.dirname(folderPathNormalized);
      const parentContents = await fs.readdir(parentDir);
      console.log(`Parent directory contents (${parentDir}):`, parentContents);
    } catch (verifyError) {
      console.error("Error verifying folder creation:", verifyError);
      throw new Error(`Folder creation verification failed: ${verifyError.message}`);
    }
    
    // Copy template folder structure if rootDirectory, year, and state are provided
    // Only copy if the folder was just created (not if it already existed with content)
    if (rootDirectory && year && state && !folderExists) {
      // Template is located at: rootDirectory\year\state\1-Folder Structure
      const templatePath = path.join(rootDirectory, year, state, "1-Folder Structure");
      
      console.log(`Looking for template at: ${templatePath}`);
      
      // Check if template folder exists
      try {
        await fs.access(templatePath);
        console.log(`Template folder found, copying contents to: ${folderPathNormalized}`);
        
        // Copy all contents from template to new project folder
        // Note: We copy the contents, not the template folder itself
        await copyDirectory(templatePath, folderPathNormalized);
        console.log(`✓ Template copied successfully to: ${folderPathNormalized}`);
      } catch (templateError) {
        // Template folder doesn't exist - that's okay, just continue without copying
        console.log(`Template folder not found at ${templatePath}, skipping copy.`);
        console.log(`Template error:`, templateError.message);
      }
    } else if (rootDirectory && year && !folderExists) {
      // Fallback: try without state (for backward compatibility)
      const templatePath = path.join(rootDirectory, year, "1-Folder Structure");
      console.log(`Looking for template at (fallback): ${templatePath}`);
      
      try {
        await fs.access(templatePath);
        console.log(`Template folder found (fallback), copying contents to: ${folderPathNormalized}`);
        await copyDirectory(templatePath, folderPathNormalized);
        console.log(`✓ Template copied successfully to: ${folderPathNormalized}`);
      } catch (templateError) {
        console.log(`Template folder not found at ${templatePath}, skipping copy.`);
      }
    }

    res.json({ success: true, path: folderPathNormalized });
  } catch (e) {
    console.error("Error creating folder:", e);
    console.error("Error stack:", e.stack);
    res.status(500).json({ error: e.message || "Failed to create folder" });
  }
});

// Link existing Proposal.PDF on disk to project (must already exist — no template copy)
app.post("/api/projects/:id/register-proposal-from-folder", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "invalid id" });
    }
    const { projectPath } = req.body || {};
    if (!projectPath || typeof projectPath !== "string") {
      return res.status(400).json({ error: "projectPath required" });
    }
    const normalized = normalizeWindowsProjectPath(projectPath);
    const clsRow = await pool.query("SELECT classification FROM projects WHERE id = $1", [id]);
    if (clsRow.rows.length === 0) {
      return res.status(404).json({ error: "project not found" });
    }
    const isRenovation = (clsRow.rows[0]?.classification || "").trim() === CLASSIFICATION_RENOVATION;
    const proposalPath = isRenovation
      ? path.join(normalized, RENOVATION_PROPOSAL_SUBFOLDER, "Proposal.PDF")
      : path.join(normalized, "Proposal.PDF");
    await fs.access(proposalPath);
    const r = await pool.query(
      "UPDATE projects SET proposal_pdf_location = $1, updated_at = NOW() WHERE id = $2 RETURNING id",
      [proposalPath, id]
    );
    if (r.rowCount === 0) {
      return res.status(404).json({ error: "project not found" });
    }
    res.json({ success: true, path: proposalPath });
  } catch (e) {
    if (e.code === "ENOENT") {
      return res.status(404).json({
        error:
          "Proposal.PDF was not found on disk. For a normal project it must be in the project folder root; for Renovation it must be in the 12. RENOVATION subfolder (as Proposal.PDF). Add the file there or upload a PDF on the proposal step.",
      });
    }
    console.error("register-proposal-from-folder:", e);
    res.status(500).json({ error: e.message || "Failed to register proposal" });
  }
});

// Locate/Upload proposal PDF (saves file and path)
app.post("/api/files/locate-proposal", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { projectId } = req.body;
    
    if (!projectId) {
      return res.status(400).json({ error: "Project ID is required" });
    }

    // Only accept PDF files
    if (req.file.mimetype !== "application/pdf" && !req.file.originalname.toLowerCase().endsWith(".pdf")) {
      return res.status(400).json({ error: "Only PDF files are allowed" });
    }

    // Get project details to build path
    let projectPath = null;
    let locateProposalClassification = "";
    if (pool) {
      const projectResult = await pool.query(
        "SELECT name, suburb, street, state, year, classification FROM projects WHERE id = $1",
        [projectId]
      );
      
      if (projectResult.rows.length > 0) {
        const project = projectResult.rows[0];
        locateProposalClassification = (project.classification || "").trim();
        // Get root directory from settings
        const settingsResult = await pool.query("SELECT root_directory FROM settings WHERE id = 1");
        const rootDir = settingsResult.rows[0]?.root_directory;
        
        if (rootDir) {
          // Extract year from date field (always derive year from the date, never store separately)
          // The 'year' field stores the full date in YYYY-MM-DD format
          let projectYear = "";
          if (project.year) {
            const dateStr = project.year.toString();
            if (dateStr.includes("-")) {
              // Extract year from date format (YYYY-MM-DD) - always derive from date
              projectYear = dateStr.split("-")[0];
            } else if (/^\d{4}$/.test(dateStr)) {
              // Legacy: if it's just a year, use it (but should be converted to full date)
              projectYear = dateStr;
            } else {
              // Fallback to current year if date format is invalid
              projectYear = new Date().getFullYear().toString();
            }
          } else {
            // Fallback to current year if no date set
            projectYear = new Date().getFullYear().toString();
          }
          
          // Get state (uppercase)
          const state = (project.state || "").toUpperCase();
          
          if (!state) {
            return res.status(400).json({ error: "Project state is required to save proposal" });
          }
          
          // Get suburb and street (ASCII hyphen between parts; unicode dashes normalized)
          const projectFolderName = buildJobProjectFolderName(project.suburb, project.street);
          projectPath = path.join(rootDir, projectYear, state, projectFolderName);
        }
      }
    }

    // Get the original filename
    const fileName = req.file.originalname;
    let fileLocation = fileName; // Default to just filename

    // If we have a project path, construct the expected file location
    // (Don't create folders or copy files - just store the path to where the file should be)
    if (projectPath) {
      const isRenovation = locateProposalClassification === CLASSIFICATION_RENOVATION;
      const baseDir = isRenovation ? path.join(projectPath, RENOVATION_PROPOSAL_SUBFOLDER) : projectPath;
      const filePath = path.join(baseDir, fileName);
      fileLocation = filePath;
      console.log(`Proposal PDF location set to: ${filePath} (no files or folders created)`);
    }

    // Update project record with proposal PDF location
    if (pool) {
      await pool.query(
        "UPDATE projects SET proposal_pdf_location = $1 WHERE id = $2",
        [fileLocation, projectId]
      );
    }

    console.log(`Proposal PDF location saved: ${fileLocation} for project ${projectId}`);
    res.json({ 
      success: true, 
      message: "Proposal location saved successfully",
      fileName: fileName,
      path: fileLocation
    });
  } catch (e) {
    console.error("Error saving proposal location:", e);
    res.status(500).json({ error: e.message || "Failed to save proposal location" });
  }
});

// Upload proposal PDF (original - for backward compatibility)
app.post("/api/files/upload-proposal", upload.single("file"), async (req, res) => {
  try {
    console.log("=== Proposal Upload Request ===");
    console.log("1. Has file:", !!req.file);
    console.log("2. File details:", req.file ? {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    } : "No file");
    console.log("3. Request body keys:", Object.keys(req.body));
    console.log("4. projectId:", req.body.projectId);
    console.log("5. projectPath:", req.body.projectPath);
    
    if (!req.file) {
      console.error("6. ERROR: No file uploaded");
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { projectId, projectPath } = req.body;
    
    if (!projectId) {
      console.error("6. ERROR: Project ID is missing");
      return res.status(400).json({ error: "Project ID is required" });
    }

    if (!projectPath) {
      console.error("6. ERROR: Project path is missing");
      return res.status(400).json({ error: "Project path is required" });
    }

    const normalizedProjectPath = normalizeWindowsProjectPath(projectPath);

    // Only accept PDF files
    if (req.file.mimetype !== "application/pdf" && !req.file.originalname.toLowerCase().endsWith(".pdf")) {
      return res.status(400).json({ error: "Only PDF files are allowed" });
    }

    if (!pool) {
      return res.status(500).json({ error: "DATABASE_URL not set" });
    }

    const fileName = "Proposal.PDF";
    const idNum = Number(projectId);
    if (!Number.isFinite(idNum)) {
      return res.status(400).json({ error: "Invalid project ID" });
    }

    const clsRow = await pool.query("SELECT classification FROM projects WHERE id = $1", [idNum]);
    if (clsRow.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }
    const isRenovation = (clsRow.rows[0]?.classification || "").trim() === CLASSIFICATION_RENOVATION;

    let filePath = path.join(normalizedProjectPath, fileName);
    if (isRenovation) {
      const renoDir = path.join(normalizedProjectPath, RENOVATION_PROPOSAL_SUBFOLDER);
      await fs.mkdir(renoDir, { recursive: true });
      filePath = path.join(renoDir, fileName);
    }

    // Write file from buffer (project root, or 12. RENOVATION for Renovation — folder must already exist)
    await fs.writeFile(filePath, req.file.buffer);

    await pool.query("UPDATE projects SET proposal_pdf_location = $1 WHERE id = $2", [filePath, idNum]);

    console.log(`Proposal PDF uploaded successfully: ${filePath}`);
    res.json({ 
      success: true, 
      message: "Proposal uploaded successfully",
      path: filePath,
      fileName: fileName
    });
  } catch (e) {
    console.error("Error uploading proposal:", e);
    res.status(500).json({ error: e.message || "Failed to upload proposal" });
  }
});

/** Window order PDF path segment (same project folder tree as Colours). */
const WINDOW_ORDER_SUBFOLDER = "8. COLOURS & WINDOWS";

/** Same year segment as drawings PDF path: `YYYY` only, or first segment before `-` if stored as a date string. */
function folderYearFromProjectYear(y) {
  const yearStr = String(y ?? "").trim();
  if (!yearStr) return "";
  if (yearStr.includes("-")) return yearStr.split("-")[0];
  return yearStr;
}

// Upload window order PDF (path derived on server: year = 4 digits only; always writes Windows.PDF into 8. COLOURS & WINDOWS)
app.post("/api/files/upload-window-order", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { projectId, orderNumber } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: "Project ID is required" });
    }

    if (!orderNumber) {
      return res.status(400).json({ error: "Order number is required" });
    }

    if (req.file.mimetype !== "application/pdf" && !req.file.originalname.toLowerCase().endsWith(".pdf")) {
      return res.status(400).json({ error: "Only PDF files are allowed" });
    }

    if (!pool) {
      return res.status(500).json({ error: "DATABASE_URL not set" });
    }

    const projectResult = await pool.query(
      "SELECT suburb, street, state, year FROM projects WHERE id = $1",
      [projectId]
    );
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const row = projectResult.rows[0];
    const state = (row.state || "").toUpperCase();
    if (!state) {
      return res.status(400).json({ error: "Project state is required" });
    }

    const settingsResult = await pool.query(
      "SELECT root_directory, root_directory_qld FROM settings WHERE id = 1"
    );
    const st = settingsResult.rows[0] || {};
    const rootDir =
      state === "VIC"
        ? String(st.root_directory || "").trim()
        : String(st.root_directory_qld || st.root_directory || "").trim();
    if (!rootDir) {
      return res.status(400).json({ error: "Root directory is not set in File Settings" });
    }

    const projectYear = folderYearFromProjectYear(row.year);
    if (!/^\d{4}$/.test(projectYear)) {
      return res.status(400).json({ error: "Project year must be YYYY (4 digits)" });
    }
    const projectFolderName = buildJobProjectFolderName(row.suburb, row.street);
    const fileSafeName = "Windows.PDF";
    const folderPath = path.join(
      rootDir,
      projectYear,
      state,
      projectFolderName,
      WINDOW_ORDER_SUBFOLDER
    );
    const filePath = path.join(folderPath, fileSafeName);

    console.log(`Window order PDF path set to: ${filePath} (writes file + creates folders if needed)`);

    await fs.mkdir(folderPath, { recursive: true });
    await fs.writeFile(filePath, req.file.buffer);

    await pool.query(
      "UPDATE projects SET window_order_pdf_location = $1, window_order_number = $2 WHERE id = $3",
      [filePath, orderNumber, projectId]
    );

    console.log(`Window order PDF uploaded successfully: ${filePath}`);
    res.json({
      success: true,
      message: "Window order uploaded successfully",
      path: filePath,
      fileName: fileSafeName,
    });
  } catch (e) {
    console.error("Error uploading window order:", e);
    res.status(500).json({ error: e.message || "Failed to upload window order" });
  }
});

// Locate window order PDF (path only — same folder convention as upload / Colours)
app.post("/api/files/locate-window-order", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { projectId } = req.body;
    if (!projectId) {
      return res.status(400).json({ error: "Project ID is required" });
    }

    if (req.file.mimetype !== "application/pdf" && !req.file.originalname.toLowerCase().endsWith(".pdf")) {
      return res.status(400).json({ error: "Only PDF files are allowed" });
    }

    if (!pool) {
      return res.status(500).json({ error: "DATABASE_URL not set" });
    }

    const projectResult = await pool.query(
      "SELECT suburb, street, state, year FROM projects WHERE id = $1",
      [projectId]
    );
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const row = projectResult.rows[0];
    const state = (row.state || "").toUpperCase();
    if (!state) {
      return res.status(400).json({ error: "Project state is required" });
    }

    const settingsResult = await pool.query(
      "SELECT root_directory, root_directory_qld FROM settings WHERE id = 1"
    );
    const st = settingsResult.rows[0] || {};
    const rootDir =
      state === "VIC"
        ? String(st.root_directory || "").trim()
        : String(st.root_directory_qld || st.root_directory || "").trim();
    if (!rootDir) {
      return res.status(400).json({ error: "Root directory is not set in File Settings" });
    }

    const projectYear = folderYearFromProjectYear(row.year);
    if (!/^\d{4}$/.test(projectYear)) {
      return res.status(400).json({ error: "Project year must be YYYY (4 digits)" });
    }

    const projectFolderName = buildJobProjectFolderName(row.suburb, row.street);
    const projectPath = path.join(rootDir, projectYear, state, projectFolderName);
    const fileName = path.basename(req.file.originalname || "window-order.pdf");
    const fileLocation = path.join(projectPath, WINDOW_ORDER_SUBFOLDER, fileName);

    await pool.query("UPDATE projects SET window_order_pdf_location = $1 WHERE id = $2", [
      fileLocation,
      projectId,
    ]);

    console.log(`Window order PDF location saved: ${fileLocation} for project ${projectId}`);
    res.json({
      success: true,
      message: "Window order location saved",
      path: fileLocation,
      fileName,
    });
  } catch (e) {
    console.error("Error locating window order PDF:", e);
    res.status(500).json({ error: e.message || "Failed to save window order location" });
  }
});

// Update site visit scheduled date and period for multiple projects
app.post("/api/projects/update-site-visit-scheduled", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  
  try {
    const { projects, updateStatus } = req.body;
    
    if (!projects || !Array.isArray(projects) || projects.length === 0) {
      return res.status(400).json({ error: "Projects array is required" });
    }

    // Update each project
    for (const projectUpdate of projects) {
      const { projectId, date, period } = projectUpdate;
      
      if (!projectId) {
        continue; // Skip invalid entries
      }

      // Only update status if updateStatus is true
      if (updateStatus === true) {
        await pool.query(
          "UPDATE projects SET site_visit_scheduled_date = $1, site_visit_scheduled_period = $2, site_visit_status = $3 WHERE id = $4",
          [date || null, period || null, "Email Sent", projectId]
        );
      } else {
        // Only update date and period, not status
        await pool.query(
          "UPDATE projects SET site_visit_scheduled_date = $1, site_visit_scheduled_period = $2 WHERE id = $3",
          [date || null, period || null, projectId]
        );
      }
    }

    const statusMsg = updateStatus === true ? " and status set to \"Email Sent\"" : "";
    console.log(`Site visit scheduled updated${statusMsg} for ${projects.length} project(s)`);
    res.json({ 
      success: true, 
      message: `Site visit schedule updated${statusMsg} for ${projects.length} project(s)`
    });
  } catch (e) {
    console.error("Error updating site visit schedule:", e);
    res.status(500).json({ error: e.message || "Failed to update site visit schedule" });
  }
});

// Send colours Windows & Roof email - identical to send-colours-reminder but uses "COLORS - Windows&Roof" template
app.post("/api/emails/send-colours-windows-roof", async (req, res) => {
  const { projectId, attachAffordable, attachSuperior, toEmails, customBody, from } = req.body || {};

  if (!projectId) {
    return res.status(400).json({ error: "Project ID is required" });
  }

  if (!pool) {
    return res.status(500).json({ error: "DATABASE_URL not set" });
  }

  // Get project details including client names
  let project = null;
  try {
    const projectResult = await pool.query(
      "SELECT suburb, street, state, client1_name, client1_active, client2_name, client2_active, client3_name, client3_active, draftsperson FROM projects WHERE id = $1",
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    project = projectResult.rows[0];
  } catch (e) {
    console.error("Error fetching project:", e);
    return res.status(500).json({ error: "Failed to fetch project details" });
  }

  // Get settings for colour attachments path and SMTP
  let colourAttachmentsPath = null;
  let smtpUser = null;
  let smtpPass = null;
  try {
    const settingsResult = await pool.query(
      "SELECT colour_attachments_vic, colour_attachments_qld, smtp_user_1, smtp_pass_1 FROM settings WHERE id = 1"
    );
    
    if (settingsResult.rows.length > 0) {
      const settings = settingsResult.rows[0];
      // Use VIC or QLD path based on project state
      if (project.state === "VIC") {
        colourAttachmentsPath = settings.colour_attachments_vic;
      } else if (project.state === "QLD") {
        colourAttachmentsPath = settings.colour_attachments_qld;
      }
      
      smtpUser = settings.smtp_user_1;
      smtpPass = settings.smtp_pass_1;
    }
  } catch (e) {
    console.error("Error reading settings:", e);
    return res.status(500).json({ error: "Failed to fetch settings" });
  }

  if (!colourAttachmentsPath) {
    return res.status(400).json({ 
      error: `Colour attachments path not configured for ${project.state || "this state"}. Please set it in Settings → File Settings.` 
    });
  }

  // Get email template by name - use "COLORS - Windows&Roof"
  let template = null;
  try {
    const templateResult = await pool.query(
      "SELECT id, name, to_addresses, from_address, subject, body FROM email_templates WHERE name = $1",
      ["COLORS - Windows&Roof"]
    );
    
    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Email template "COLORS - Windows&Roof" not found. Please create it in Settings → Email Templates.' });
    }
    
    try {
      template = {
        ...templateResult.rows[0],
        to_addresses: templateResult.rows[0].to_addresses ? JSON.parse(templateResult.rows[0].to_addresses) : []
      };
    } catch (parseError) {
      console.error("Error parsing template to_addresses:", parseError);
      template = {
        ...templateResult.rows[0],
        to_addresses: []
      };
    }
  } catch (e) {
    console.error("Error fetching email template:", e);
    return res.status(500).json({ error: `Failed to fetch email template: ${e.message}` });
  }

  // Get Colour Consultant name(s)
  let colourConsultantName = "";
  try {
    const consultantResult = await pool.query(
      `SELECT DISTINCT u.name 
       FROM users u
       INNER JOIN user_positions up ON u.id = up.user_id
       INNER JOIN positions p ON up.position_id = p.id
       WHERE LOWER(TRIM(p.name)) = LOWER(TRIM($1))
       ORDER BY u.name ASC`,
      ["Colour Consultant"]
    );
    
    if (consultantResult.rows.length > 0) {
      const consultantNames = consultantResult.rows.map(row => row.name.trim()).filter(name => name);
      if (consultantNames.length === 1) {
        colourConsultantName = consultantNames[0];
      } else if (consultantNames.length > 1) {
        // Multiple consultants: "Name1, Name2 & Name3"
        if (consultantNames.length === 2) {
          colourConsultantName = `${consultantNames[0]} & ${consultantNames[1]}`;
        } else {
          const allButLast = consultantNames.slice(0, -1).join(", ");
          const last = consultantNames[consultantNames.length - 1];
          colourConsultantName = `${allButLast} & ${last}`;
        }
      }
    }
  } catch (e) {
    console.error("Error fetching Colour Consultant:", e);
    // Don't fail if we can't find consultant, just leave token as empty string
  }

  // Build attachment paths
  // Normalize the path (handle trailing slashes/backslashes)
  const normalizedPath = colourAttachmentsPath.replace(/[\/\\]+$/, "");
  const attachments = [];
  
  if (attachAffordable) {
    const affordablePath = path.join(normalizedPath, "COLOR_AFFORDABLE.pdf");
    console.log(`Attempting to read COLOR_AFFORDABLE.pdf from: ${affordablePath}`);
    try {
      await fs.access(affordablePath);
      const fileBuffer = await fs.readFile(affordablePath);
      attachments.push({
        filename: "COLOR_AFFORDABLE.pdf",
        content: fileBuffer,
        contentType: "application/pdf",
      });
      console.log(`Successfully loaded COLOR_AFFORDABLE.pdf`);
    } catch (e) {
      console.error(`Error reading COLOR_AFFORDABLE.pdf: ${e.message}`, e);
      return res.status(404).json({ error: `COLOR_AFFORDABLE.pdf not found at ${affordablePath}. Error: ${e.message}` });
    }
  }

  if (attachSuperior) {
    const superiorPath = path.join(normalizedPath, "COLOR_SUPERIOR.pdf");
    console.log(`Attempting to read COLOR_SUPERIOR.pdf from: ${superiorPath}`);
    try {
      await fs.access(superiorPath);
      const fileBuffer = await fs.readFile(superiorPath);
      attachments.push({
        filename: "COLOR_SUPERIOR.pdf",
        content: fileBuffer,
        contentType: "application/pdf",
      });
      console.log(`Successfully loaded COLOR_SUPERIOR.pdf`);
    } catch (e) {
      console.error(`Error reading COLOR_SUPERIOR.pdf: ${e.message}`, e);
      return res.status(404).json({ error: `COLOR_SUPERIOR.pdf not found at ${superiorPath}. Error: ${e.message}` });
    }
  }

  if (attachments.length === 0) {
    return res.status(400).json({ error: "At least one attachment must be selected" });
  }

  // Get SMTP credentials based on template's from_address
  // For QLD projects, use QLD SMTP; for VIC projects, use from_address to determine primary/secondary
  if (project.state === "QLD") {
    // QLD projects use SMTP slot 4 (legacy smtp_user_qld)
    try {
      const settingsResult = await pool.query(
        `SELECT smtp_user_${SMTP_SLOT_QLD} AS u, smtp_pass_${SMTP_SLOT_QLD} AS p FROM settings WHERE id = 1`
      );
      if (settingsResult.rows.length > 0 && settingsResult.rows[0].u && settingsResult.rows[0].p) {
        smtpUser = settingsResult.rows[0].u;
        smtpPass = settingsResult.rows[0].p;
      }
    } catch (e) {
      console.error("Error reading QLD SMTP from settings:", e);
    }
  } else {
    // VIC project - use from_address to determine which SMTP to use
    const fromAddress = template.from_address;
    const smtpCreds = await getSmtpCredentialsForFromAddress(fromAddress);
    smtpUser = smtpCreds.smtpUser;
    smtpPass = smtpCreds.smtpPass;
  }

  if (!smtpUser || !smtpPass) {
    smtpUser = process.env.SMTP_USER;
    smtpPass = process.env.SMTP_PASS;
  }
  if (!smtpUser || !smtpPass) {
    return res.status(503).json({
      error:
        "SMTP not configured. Set SMTP User and SMTP Pass in Settings → File Settings, or use backend .env.",
    });
  }

  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true";

  try {
    // Create email transporter
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: smtpUser, pass: smtpPass },
    });

    // Prepare email content from template
    const suburb = (project.suburb || "").toUpperCase();
    const street = project.street || "";
    
    // Get active client names (first names only)
    const activeClientFirstNames = [];
    if (project.client1_active === true || project.client1_active === 'true') {
      if (project.client1_name && project.client1_name.trim()) {
        const firstName = project.client1_name.trim().split(/\s+/)[0]; // Get first word
        if (firstName) activeClientFirstNames.push(firstName);
      }
    }
    if (project.client2_active === true || project.client2_active === 'true') {
      if (project.client2_name && project.client2_name.trim()) {
        const firstName = project.client2_name.trim().split(/\s+/)[0]; // Get first word
        if (firstName) activeClientFirstNames.push(firstName);
      }
    }
    if (project.client3_active === true || project.client3_active === 'true') {
      if (project.client3_name && project.client3_name.trim()) {
        const firstName = project.client3_name.trim().split(/\s+/)[0]; // Get first word
        if (firstName) activeClientFirstNames.push(firstName);
      }
    }
    
    // Format client first names with commas and "&"
    let clientName = "";
    if (activeClientFirstNames.length === 0) {
      clientName = ""; // No active clients
    } else if (activeClientFirstNames.length === 1) {
      clientName = activeClientFirstNames[0];
    } else if (activeClientFirstNames.length === 2) {
      clientName = `${activeClientFirstNames[0]} & ${activeClientFirstNames[1]}`;
    } else {
      // 3 or more: "Name1, Name2 & Name3"
      const allButLast = activeClientFirstNames.slice(0, -1).join(", ");
      const last = activeClientFirstNames[activeClientFirstNames.length - 1];
      clientName = `${allButLast} & ${last}`;
    }
    
    // Format project name: "<Street>, <Suburb>"
    const projectName = `${street || ""}, ${suburb || ""}`.trim().replace(/^,\s*|,\s*$/g, "");
    
    const draftspersonName = draftspersonTokenDisplay(project.draftsperson);
    
    // Replace template variables in subject and body
    let subject = (template.subject || "").toString();
    // Use customBody if provided, otherwise use template body
    let htmlBody = (customBody !== undefined && customBody !== null) ? customBody.toString() : (template.body || "").toString();
    
    // Replace common placeholders
    subject = subject.replace(/\{SUBURB\}/g, suburb)
                     .replace(/\{STREET\}/g, street)
                     .replace(/\{ClientName\}/g, clientName)
                     .replace(/\{ProjectName\}/g, projectName)
                     .replace(/\{ColourConsultant\}/g, colourConsultantName)
                     .replace(/\{Draftsperson\}/g, draftspersonName)
                     .replace(/\{DRAFTSPERSON\}/g, draftspersonName);
    // Only replace tokens in htmlBody if customBody was not provided (to avoid double replacement)
    if (customBody === undefined || customBody === null) {
      htmlBody = htmlBody.replace(/\{SUBURB\}/g, suburb)
                         .replace(/\{STREET\}/g, street)
                         .replace(/\{ClientName\}/g, clientName)
                         .replace(/\{ProjectName\}/g, projectName)
                         .replace(/\{ColourConsultant\}/g, colourConsultantName)
                         .replace(/\{Draftsperson\}/g, draftspersonName)
                         .replace(/\{DRAFTSPERSON\}/g, draftspersonName);
    }
    
    // Convert newlines to HTML breaks
    htmlBody = htmlBody.replace(/\n/g, "<br>");
    
    // Wrap in HTML structure if not already HTML
    if (!htmlBody.includes("<html") && !htmlBody.includes("<!DOCTYPE")) {
      htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">${htmlBody}</body></html>`;
    }

    const fromTrim = from != null ? String(from).trim() : "";
    if (!fromTrim) {
      return res.status(400).json({
        error: "From address is required in the request body. The server does not use the template From field or SMTP user as a fallback.",
      });
    }

    let recipientEmails = [];
    if (toEmails && Array.isArray(toEmails) && toEmails.length > 0) {
      recipientEmails = toEmails.map((email) => String(email || "").trim()).filter(Boolean);
    }
    if (recipientEmails.length === 0) {
      return res.status(400).json({
        error: "No valid recipient email addresses in toEmails. The server does not fall back to template To addresses.",
      });
    }

    const recipientEmail = recipientEmails.join(", ");
    const fromAddress = fromTrim;

    // Add logo to email (logo will be added to existing attachments array)
    const logoResult = await addLogoToEmail(htmlBody, attachments);
    
    const mailOptions = {
      from: fromAddress,
      to: recipientEmail,
      subject: subject,
      html: logoResult.htmlBody,
      attachments: logoResult.attachments,
    };

    console.log(`Sending colours Windows & Roof email from: ${fromAddress}`);
    console.log(`Sending colours Windows & Roof email to: ${recipientEmail}`);
    console.log(`Subject: ${subject}`);
    console.log(`Attachments: ${attachments.length} file(s)`);
    
    // Verify SMTP connection before sending
    try {
      await transporter.verify();
      console.log("SMTP connection verified successfully");
    } catch (verifyError) {
      console.error("SMTP verification failed:", verifyError);
      return res.status(500).json({
        error: `SMTP connection failed: ${verifyError.message || verifyError}`,
        details: verifyError.response || verifyError.code,
      });
    }
    
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully. Message ID: ${info.messageId}`);
    
    // Add project log entry
    try {
      const now = new Date();
      const dateTimeStr = now.toISOString().replace('T', ' ').substring(0, 19);
      const attachmentsList = [];
      if (attachAffordable) attachmentsList.push("Affordable");
      if (attachSuperior) attachmentsList.push("Superior");
      const attachmentsText = attachmentsList.length > 0 ? ` - ${attachmentsList.join(", ")}` : "";
      const logEntry = `Colours Windows & Roof Email Sent${attachmentsText} - ${dateTimeStr}`;
      
      // Get current project log
      const projectLogResult = await pool.query(
        "SELECT project_log FROM projects WHERE id = $1",
        [projectId]
      );
      
      const currentLog = projectLogResult.rows[0]?.project_log || "";
      const newLog = currentLog ? `${currentLog}\n${logEntry}` : logEntry;
      
      // Update project log
      await pool.query(
        "UPDATE projects SET project_log = $1 WHERE id = $2",
        [newLog, projectId]
      );
      
      console.log(`Project log updated for project ${projectId}`);
    } catch (logError) {
      console.error("Error updating project log:", logError);
      // Don't fail the request if log update fails
    }
    
    res.json({ success: true, messageId: info.messageId, message: "Colours Windows & Roof email sent successfully!" });
  } catch (e) {
    console.error("Error in POST /api/emails/send-colours-windows-roof:", e);
    console.error("Error stack:", e.stack);
    
    // Extract more detailed error information from nodemailer
    let errorMessage = e.message || "Failed to send email. Check SMTP settings and credentials.";
    let errorDetails = null;
    
    if (e.response) {
      errorDetails = e.response;
      errorMessage += ` Response: ${e.response}`;
    }
    if (e.responseCode) {
      errorDetails = { code: e.responseCode, response: e.response };
      errorMessage += ` Code: ${e.responseCode}`;
    }
    if (e.command) {
      errorMessage += ` Command: ${e.command}`;
    }
    
    res.status(500).json({
      error: errorMessage,
      details: errorDetails,
    });
  }
});

// Send colours portal email
app.post("/api/emails/send-colours-portal", async (req, res) => {
  const { projectId, toEmails, from, subject, htmlBody } = req.body || {};

  if (!projectId) {
    return res.status(400).json({ error: "Project ID is required" });
  }

  const fromTrimPortal = from != null ? String(from).trim() : "";
  if (!fromTrimPortal) {
    return res.status(400).json({
      error: "From address is required. The server does not substitute the SMTP login address.",
    });
  }

  if (!pool) {
    return res.status(500).json({ error: "DATABASE_URL not set" });
  }

  // Get project details
  let project = null;
  try {
    const projectResult = await pool.query(
      "SELECT suburb, street, state FROM projects WHERE id = $1",
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    project = projectResult.rows[0];
  } catch (e) {
    console.error("Error fetching project:", e);
    return res.status(500).json({ error: "Failed to fetch project details" });
  }

  let smtpUser = null;
  let smtpPass = null;
  try {
    const smtpCreds = await getSmtpCredentialsForFromAddress(fromTrimPortal);
    smtpUser = smtpCreds.smtpUser;
    smtpPass = smtpCreds.smtpPass;
  } catch (e) {
    console.error("Error getting SMTP credentials:", e);
  }

  if (!smtpUser || !smtpPass) {
    return res.status(503).json({
      error: "SMTP not configured. Set SMTP User and SMTP Pass in Settings → File Settings, or use backend .env.",
    });
  }

  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true";

  try {
    // Create email transporter
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: smtpUser, pass: smtpPass },
    });

    // Add "Click here for colours" button to email body
    const portalBase = await resolveEmailAppPublicBase(pool, req, req.body);
    const portalUrl = `${portalBase}/3d-vis-portal/${projectId}`;
    const buttonHtml = `
      <br><br>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${portalUrl}" style="
          display: inline-block;
          padding: 20px 48px;
          background-color: #4D93D9;
          color: #ffffff;
          text-decoration: none;
          border-radius: 10px;
          font-weight: 600;
          font-size: 1.3rem;
          box-shadow: 0 4px 12px rgba(77, 147, 217, 0.4);
        ">Click here for colours</a>
      </div>
    `;
    
    // Insert button before "Powered by" or at the end
    let finalHtmlBody = htmlBody || "";
    const poweredByPattern = /Powered by SGF Central/i;
    const poweredByMatch = finalHtmlBody.match(poweredByPattern);
    if (poweredByMatch) {
      const insertIndex = poweredByMatch.index;
      finalHtmlBody = finalHtmlBody.slice(0, insertIndex) + buttonHtml + finalHtmlBody.slice(insertIndex);
    } else {
      // Append at the end
      finalHtmlBody += buttonHtml;
    }

    // Add logo to email
    const attachments = [];
    const logoResult = await addLogoToEmail(finalHtmlBody, attachments);

    const recipientEmail = toEmails && Array.isArray(toEmails) && toEmails.length > 0
      ? toEmails.filter(email => email && email.trim()).join(", ")
      : "";

    if (!recipientEmail) {
      return res.status(400).json({ error: "No valid recipient email addresses provided" });
    }

    const mailOptions = {
      from: fromTrimPortal,
      to: recipientEmail,
      subject: subject || "Colours Portal",
      html: logoResult.htmlBody,
      attachments: logoResult.attachments,
    };

    console.log(`Sending colours portal email from: ${fromTrimPortal}`);
    console.log(`Sending colours portal email to: ${recipientEmail}`);
    console.log(`Subject: ${subject || "Colours Portal"}`);

    const info = await transporter.sendMail(mailOptions);
    console.log("Colours portal email sent successfully:", info.messageId);

    res.json({ success: true, messageId: info.messageId, message: "Colours portal email sent successfully!" });
  } catch (e) {
    console.error("Error in POST /api/emails/send-colours-portal:", e);
    console.error("Error stack:", e.stack);
    
    let errorMessage = e.message || "Failed to send email. Check SMTP settings and credentials.";
    let errorDetails = null;
    
    if (e.response) {
      errorDetails = e.response;
      errorMessage += ` Response: ${e.response}`;
    }
    if (e.responseCode) {
      errorDetails = { code: e.responseCode, response: e.response };
      errorMessage += ` Code: ${e.responseCode}`;
    }
    if (e.command) {
      errorMessage += ` Command: ${e.command}`;
    }
    
    res.status(500).json({
      error: errorMessage,
      details: errorDetails,
    });
  }
});

// Update colours from portal (public endpoint - no auth required)
app.post("/api/projects/:id/update-colours", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const { roof_colour, cladding_colour, baseboards_colour } = req.body || {};

  try {
    // Verify project exists
    const projectResult = await pool.query("SELECT id FROM projects WHERE id = $1", [id]);
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Update colours - always set to provided values (including NULL to clear)
    const updateResult = await pool.query(
      `UPDATE projects 
       SET roof_colour = $1,
           cladding_colour = $2,
           baseboards_colour = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, roof_colour, cladding_colour, baseboards_colour`,
      [roof_colour, cladding_colour, baseboards_colour, id]
    );

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ error: "Failed to update project" });
    }

    res.json({ 
      success: true, 
      message: "Colours updated successfully",
      project: updateResult.rows[0]
    });
  } catch (e) {
    console.error("Error updating colours:", e);
    res.status(500).json({ error: e.message || "Failed to update colours" });
  }
});

// Send windows order email
app.post("/api/emails/send-windows-order", async (req, res) => {
  const {
    projectId,
    customBody,
    windowColour,
    windowReveal,
    windowGlazing,
    windowBalRating,
    windowDateRequired,
    from,
    toEmails,
  } = req.body || {};

  if (!projectId) {
    return res.status(400).json({ error: "Project ID is required" });
  }

  const fromTrim = from != null ? String(from).trim() : "";
  if (!fromTrim) {
    return res.status(400).json({
      error: "From address is required. The server does not use the template From field or SMTP user as a fallback.",
    });
  }

  const recipientList =
    Array.isArray(toEmails) && toEmails.length > 0
      ? toEmails.map((e) => String(e || "").trim()).filter(Boolean)
      : [];
  if (recipientList.length === 0) {
    return res.status(400).json({
      error: "At least one recipient in toEmails is required. The server does not use template To addresses.",
    });
  }

  if (!pool) {
    return res.status(500).json({ error: "DATABASE_URL not set" });
  }

  // Get project details including drawings PDF location
  let project = null;
  let drawingsPdfPath = null;
  try {
    const projectResult = await pool.query(
      "SELECT suburb, street, state, drawings_pdf_location FROM projects WHERE id = $1",
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    project = projectResult.rows[0];
    drawingsPdfPath = project.drawings_pdf_location;
  } catch (e) {
    console.error("Error fetching project:", e);
    return res.status(500).json({ error: "Failed to fetch project details" });
  }

  const smtpCreds = await getSmtpCredentialsForFromAddress(fromTrim);
  let smtpUser = smtpCreds.smtpUser;
  let smtpPass = smtpCreds.smtpPass;
  if (!smtpUser || !smtpPass) {
    return res.status(503).json({
      error:
        "SMTP not configured for this From address, or no matching SMTP slot. Set credentials in Settings → File Settings, or use backend .env.",
    });
  }

  // Get email template
  let template = null;
  try {
    const templateResult = await pool.query(
      "SELECT id, name, to_addresses, from_address, subject, body FROM email_templates WHERE name = $1",
      ["WINDOWS - Order"]
    );
    
    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Email template "WINDOWS - Order" not found. Please create it in Settings → Email Templates.' });
    }
    
    try {
      template = {
        ...templateResult.rows[0],
        to_addresses: templateResult.rows[0].to_addresses ? JSON.parse(templateResult.rows[0].to_addresses) : []
      };
    } catch (parseError) {
      console.error("Error parsing template to_addresses:", parseError);
      template = {
        ...templateResult.rows[0],
        to_addresses: []
      };
    }
  } catch (e) {
    console.error("Error fetching email template:", e);
    return res.status(500).json({ error: `Failed to fetch email template: ${e.message}` });
  }

  // Build window ordering information
  // Note: windowDateRequired will already be formatted (date string for "Normal", "Urgent" for urgent)
  const windowInfo = `Window Colour: ${windowColour || "N/A"}
Reveal: ${windowReveal || "N/A"}
Glazing: ${windowGlazing || "N/A"}
BAL Rating: ${windowBalRating || "N/A"}
Date Required: ${windowDateRequired || "N/A"}`;

  // Prepare email content
  const suburb = (project.suburb || "").toUpperCase();
  const street = project.street || "";
  const projectName = `${street || ""}, ${suburb || ""}`.trim().replace(/^,\s*|,\s*$/g, "");
  
  // Replace template variables in subject and body
  let subject = (template.subject || "").toString();
  // Use customBody if provided, otherwise use template body
  let htmlBody = (customBody !== undefined && customBody !== null) ? customBody.toString() : (template.body || "").toString();
  
  // Replace common placeholders
  subject = subject.replace(/\{SUBURB\}/g, suburb)
                   .replace(/\{STREET\}/g, street)
                   .replace(/\{ProjectName\}/g, projectName);
  
  // Only replace tokens in htmlBody if customBody was not provided
  if (customBody === undefined || customBody === null) {
    htmlBody = htmlBody.replace(/\{SUBURB\}/g, suburb)
                       .replace(/\{STREET\}/g, street)
                       .replace(/\{ProjectName\}/g, projectName);
    
    // Insert window info after "<b>Scope</b>"
    // Look for <b>Scope</b> or <b>scope</b> (case insensitive)
    const scopePattern = /<b>Scope<\/b>/i;
    const match = htmlBody.match(scopePattern);
    if (match) {
      // Find the position after the closing </b>
      const insertIndex = match.index + match[0].length;
      // Insert window info after </b>
      htmlBody = htmlBody.slice(0, insertIndex) + "\n\n" + windowInfo + htmlBody.slice(insertIndex);
    } else {
      // If "<b>Scope</b>" not found, append at the end
      htmlBody = htmlBody + "\n\n" + windowInfo;
    }
  }
  
  // Convert newlines to HTML breaks
  htmlBody = htmlBody.replace(/\n/g, "<br>");
  
  // Wrap in HTML structure if not already HTML
  if (!htmlBody.includes("<html") && !htmlBody.includes("<!DOCTYPE")) {
    htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">${htmlBody}</body></html>`;
  }

  const recipientEmail = recipientList.join(", ");
  const fromAddress = fromTrim;

  // Build attachments array - attach drawings PDF (required)
  const attachments = [];
  
  if (!drawingsPdfPath) {
    return res.status(400).json({ error: "Drawings PDF not found for this project. Please upload drawings on the Drawings page before sending the window order email." });
  }
  
  try {
    // Check if file exists
    await fs.access(drawingsPdfPath);
    const fileBuffer = await fs.readFile(drawingsPdfPath);
    const fileName = drawingsPdfPath.split("\\").pop() || drawingsPdfPath.split("/").pop() || "drawings.pdf";
    attachments.push({
      filename: fileName,
      content: fileBuffer,
      contentType: "application/pdf",
    });
    console.log(`Successfully loaded drawings PDF: ${fileName}`);
  } catch (e) {
    console.error(`Error reading drawings PDF: ${e.message}`, e);
    return res.status(404).json({ error: `Drawings PDF file does not exist at ${drawingsPdfPath}. Please ensure the drawings PDF has been uploaded correctly.` });
  }
  
  // Add logo to email (logo will be added to existing attachments array)
  const logoResult = await addLogoToEmail(htmlBody, attachments);
  
  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true";

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const mailOptions = {
      from: fromAddress,
      to: recipientEmail,
      subject: subject,
      html: logoResult.htmlBody,
      attachments: logoResult.attachments,
    };

    console.log(`Sending windows order email from: ${fromAddress}`);
    console.log(`Sending windows order email to: ${recipientEmail}`);
    console.log(`Subject: ${subject}`);
    
    // Verify SMTP connection before sending
    try {
      await transporter.verify();
      console.log("SMTP connection verified successfully");
    } catch (verifyError) {
      console.error("SMTP verification failed:", verifyError);
      return res.status(500).json({
        error: `SMTP connection failed: ${verifyError.message || verifyError}`,
        details: verifyError.response || verifyError.code,
      });
    }
    
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully. Message ID: ${info.messageId}`);
    
    // Update window status to "Ordered" and set ordered date
    try {
      const now = new Date();
      const dateTimeStr = now.toISOString().replace('T', ' ').substring(0, 19);
      
      // Get current project log
      const projectLogResult = await pool.query(
        "SELECT project_log FROM projects WHERE id = $1",
        [projectId]
      );
      
      const currentLog = projectLogResult.rows[0]?.project_log || "";
      const logEntry = `Window Order Email Sent - ${dateTimeStr}`;
      const newLog = currentLog ? `${currentLog}\n${logEntry}` : logEntry;
      
      // Update project log, window status, and window_ordered_date
      await pool.query(
        "UPDATE projects SET project_log = $1, window_status = $2, window_ordered_date = $3 WHERE id = $4",
        [newLog, "Ordered", dateTimeStr, projectId]
      );
      
      console.log(`Project log and window status updated for project ${projectId}`);
    } catch (logError) {
      console.error("Error updating project log:", logError);
      // Don't fail the request if log update fails
    }
    
    res.json({ success: true, messageId: info.messageId, message: "Window order email sent successfully!" });
  } catch (e) {
    console.error("Error in POST /api/emails/send-windows-order:", e);
    console.error("Error stack:", e.stack);
    
    let errorMessage = e.message || "Failed to send email. Check SMTP settings and credentials.";
    let errorDetails = null;
    
    if (e.response) {
      errorDetails = e.response;
      errorMessage += ` Response: ${e.response}`;
    }
    if (e.responseCode) {
      errorDetails = { code: e.responseCode, response: e.response };
      errorMessage += ` Code: ${e.responseCode}`;
    }
    if (e.command) {
      errorMessage += ` Command: ${e.command}`;
    }
    
    res.status(500).json({
      error: errorMessage,
      details: errorDetails || (process.env.NODE_ENV === "development" ? e.stack : undefined),
    });
  }
});

// Serve window order PDF (exact path from DB only — no alternate locations)
app.get("/api/files/window-order/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!pool) {
      return res.status(500).json({ error: "DATABASE_URL not set" });
    }

    // Get project and window order PDF location
    const projectResult = await pool.query(
      "SELECT window_order_pdf_location FROM projects WHERE id = $1",
      [id]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const orderPdfPath = projectResult.rows[0].window_order_pdf_location;

    if (!orderPdfPath) {
      return res.status(404).json({ error: "Window order PDF not found for this project" });
    }

    const filePath = String(orderPdfPath).trim();
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: "Window order PDF file does not exist" });
    }

    // Read and send the file
    const fileBuffer = await fs.readFile(filePath);
    const downloadName = (path.basename(filePath) || "window-order.pdf").replace(/"/g, "");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${downloadName}"`);
    res.send(fileBuffer);
  } catch (error) {
    console.error("Error serving window order PDF:", error);
    res.status(500).json({ error: error.message });
  }
});

// Serve drawings PDF
app.get("/api/files/drawings/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!pool) {
      return res.status(500).json({ error: "DATABASE_URL not set" });
    }

    // Get project and drawings PDF location
    const projectResult = await pool.query(
      "SELECT drawings_pdf_location, suburb, street, state, year FROM projects WHERE id = $1",
      [id]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const projectRow = projectResult.rows[0];
    let drawingsPdfPath = resolveStoredFilesystemPath(projectRow.drawings_pdf_location);

    if (!drawingsPdfPath) {
      return res.status(404).json({ error: "Drawings PDF not found for this project" });
    }

    // Check if file exists
    try {
      await fs.access(drawingsPdfPath);
    } catch (e) {
      // Recovery path:
      // If suburb/street/year changed after drawings path was first saved (e.g. "St" -> "Street"),
      // rebuild expected folder from current project fields and try same filename there.
      const stateUpper = (projectRow.state || "").toString().toUpperCase().trim();
      const projectYear = folderYearFromProjectYear(projectRow.year);
      const fileName = path.basename(drawingsPdfPath || "").trim();
      if (!stateUpper || !projectYear || !fileName) {
        return res.status(404).json({ error: "Drawings PDF file does not exist" });
      }

      const settingsResult = await pool.query(
        "SELECT root_directory, root_directory_qld FROM settings WHERE id = 1"
      );
      const st = settingsResult.rows[0] || {};
      const rootDir =
        stateUpper === "QLD"
          ? String(st.root_directory_qld || st.root_directory || "").trim()
          : String(st.root_directory || "").trim();
      if (!rootDir) {
        return res.status(404).json({ error: "Drawings PDF file does not exist" });
      }

      const matchedProjectFolderPath = await findBestProjectFolderPathLenient(
        rootDir,
        projectYear,
        stateUpper,
        projectRow.suburb,
        projectRow.street
      );
      if (!matchedProjectFolderPath) {
        return res.status(404).json({ error: "Drawings PDF file does not exist" });
      }
      const recoveredPath = path.join(matchedProjectFolderPath, "2. PUBLISHED PLANS", fileName);

      try {
        await fs.access(recoveredPath);
        drawingsPdfPath = recoveredPath;
        // Self-heal saved path so future opens are fast and stable.
        await pool.query(
          "UPDATE projects SET drawings_pdf_location = $1, updated_at = NOW() WHERE id = $2",
          [recoveredPath, id]
        );
      } catch {
        return res.status(404).json({ error: "Drawings PDF file does not exist" });
      }
    }

    // Read and send the file
    const fileBuffer = await fs.readFile(drawingsPdfPath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="Drawings.pdf"`);
    res.send(fileBuffer);
  } catch (error) {
    console.error("Error serving drawings PDF:", error);
    res.status(500).json({ error: error.message });
  }
});

/** Slot letter → DB column for planning job-file uploads (folder `7. PROPERTY INFORMATION`). */
const PLANNING_JF_FILE_SLOT_COLUMNS = {
  a: "planning_jf_planning_property_report_path",
  b: "planning_jf_title_path",
  c: "planning_jf_covenant_path",
  d: "planning_jf_section_173_agreement_path",
  e: "planning_jf_plan_of_subdivision_path",
  f: "planning_jf_ebyda_stormwater_path",
  g: "planning_jf_byda_sewer_main_path",
  h: "planning_jf_internal_sewer_plan_path",
  i: "planning_jf_sewer_main_size_depth_offset_path",
  j: "planning_jf_legal_point_discharge_path",
  k: "planning_jf_property_info_report_path",
};

/** Same slots → status column (only "Received" rows may contribute files to merge). */
const PLANNING_JF_FILE_SLOT_STATUS_COLUMNS = {
  a: "planning_jf_planning_property_report",
  b: "planning_jf_title",
  c: "planning_jf_covenant",
  d: "planning_jf_section_173_agreement",
  e: "planning_jf_plan_of_subdivision",
  f: "planning_jf_ebyda_stormwater",
  g: "planning_jf_byda_sewer_main",
  h: "planning_jf_internal_sewer_plan",
  i: "planning_jf_sewer_main_size_depth_offset",
  j: "planning_jf_legal_point_discharge",
  k: "planning_jf_property_info_report",
};

/** Saved file base name (extension taken from upload). */
const PLANNING_JF_UPLOAD_FILE_BASE_BY_SLOT = {
  a: "Planning Property Report",
  b: "Title",
  c: "Covenant",
  d: "Section 173 Agreement",
  e: "Plan of Subdivision",
  f: "BYDA – Stormwater",
  g: "BYDA Sewer Main",
  h: "Internal Sewer Plan",
  i: "Sewer Main Size Depth and Offset",
  j: "Legal Point of Discharge",
  k: "Property Information Report",
};

const PLANNING_JF_PROPERTY_INFO_SUBFOLDER = "7. PROPERTY INFORMATION";

function planningJfSanitizeProjectFolderName(suburb, street) {
  const s = buildJobProjectFolderName(suburb, street);
  return s.trim() ? s : "_";
}

function planningJfYearFromProjectRow(projectRow) {
  if (projectRow?.year) {
    const ys = projectRow.year.toString();
    return ys.includes("-") ? ys.split("-")[0] : ys;
  }
  return String(new Date().getFullYear());
}

/** Absolute path to `…\\7. PROPERTY INFORMATION` for this project (matches frontend / batch scripts). */
async function planningJfPropertyInfoDirAbs(pgPool, projectRow) {
  const rootR = await pgPool.query("SELECT root_directory FROM settings WHERE id = 1");
  const root = (rootR.rows[0]?.root_directory || "").toString().trim();
  if (!root) {
    const err = new Error("Root directory is not set. Configure it in File Settings.");
    err.code = "NO_ROOT";
    throw err;
  }
  const state = (projectRow.state || "").toString().toUpperCase().trim();
  if (!state) {
    const err = new Error("Project state is required.");
    err.code = "NO_STATE";
    throw err;
  }
  const year = planningJfYearFromProjectRow(projectRow);
  const folder = planningJfSanitizeProjectFolderName(projectRow.suburb, projectRow.street);
  return path.join(root, year, state, folder, PLANNING_JF_PROPERTY_INFO_SUBFOLDER);
}

function contentTypeForPlanningJfFile(filePath) {
  const ext = path.extname(filePath || "").toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".bmp") return "image/bmp";
  if (ext === ".tif" || ext === ".tiff") return "image/tiff";
  return "application/octet-stream";
}

const PLANNING_JF_MERGE_SLOT_ORDER = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"];

// Copy dropped file into `7. PROPERTY INFORMATION` with a standard name; update the slot path column.
app.post("/api/projects/:id/planning-jf-upload", upload.single("file"), async (req, res) => {
  try {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: "invalid id" });
    }
    if (!pool) {
      return res.status(500).json({ error: "DATABASE_URL not set" });
    }
    const slot = (req.body?.slot || "").toString().toLowerCase().trim();
    const pathCol = PLANNING_JF_FILE_SLOT_COLUMNS[slot];
    const fileBase = PLANNING_JF_UPLOAD_FILE_BASE_BY_SLOT[slot];
    if (!pathCol || !fileBase || !req.file?.buffer) {
      return res.status(400).json({ error: "Valid slot (a-k) and file are required" });
    }
    const origName = req.file.originalname || "upload";
    let ext = path.extname(origName).toLowerCase();
    const allowed = new Set([".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff"]);
    if (!allowed.has(ext)) {
      return res.status(400).json({ error: "Unsupported file type" });
    }
    if (ext === ".jpeg") ext = ".jpg";

    const pr = await pool.query(
      "SELECT id, year, state, suburb, street FROM projects WHERE id = $1",
      [projectId]
    );
    if (pr.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }
    const proj = pr.rows[0];

    const dir = await planningJfPropertyInfoDirAbs(pool, proj);
    await fs.mkdir(dir, { recursive: true });
    const destName = `${fileBase}${ext}`;
    const fullPath = path.join(dir, destName);
    await fs.writeFile(fullPath, req.file.buffer);

    await pool.query(`UPDATE projects SET ${pathCol} = $1, updated_at = NOW() WHERE id = $2`, [fullPath, projectId]);

    return res.json({ ok: true, path: fullPath, savedAs: destName, slot });
  } catch (e) {
    if (e.code === "NO_ROOT" || e.code === "NO_STATE") {
      return res.status(400).json({ error: e.message });
    }
    console.error("planning-jf-upload:", e);
    return res.status(500).json({ error: e.message || "Upload failed" });
  }
});

/** Remove stored paths where doc status is not Received (fixes legacy DB rows). */
async function scrubPlanningJfPathsNotReceived(pgPool) {
  if (!pgPool) return;
  try {
    for (const slot of PLANNING_JF_MERGE_SLOT_ORDER) {
      const statusCol = PLANNING_JF_FILE_SLOT_STATUS_COLUMNS[slot];
      const pathCol = PLANNING_JF_FILE_SLOT_COLUMNS[slot];
      await pgPool.query(
        `UPDATE projects SET ${pathCol} = NULL
         WHERE TRIM(COALESCE(${statusCol}, '')) <> 'Received'
           AND ${pathCol} IS NOT NULL
           AND TRIM(COALESCE(${pathCol}, '')) <> ''`
      );
    }
    const noJfDocReceived = PLANNING_JF_MERGE_SLOT_ORDER.map(
      (s) => `TRIM(COALESCE(${PLANNING_JF_FILE_SLOT_STATUS_COLUMNS[s]}, '')) <> 'Received'`
    ).join(" AND ");
    await pgPool.query(
      `UPDATE projects SET planning_jf_job_file_pdf_path = NULL
       WHERE planning_jf_job_file_pdf_path IS NOT NULL
         AND ${noJfDocReceived}`
    );
  } catch (e) {
    console.log("Planning JF path scrub (non-Received):", e.message);
  }
}

function planningJfAddImagePageFit(mergedPdf, img) {
  const page = mergedPdf.addPage();
  const pw = page.getWidth();
  const ph = page.getHeight();
  const margin = 40;
  const maxW = pw - 2 * margin;
  const maxH = ph - 2 * margin;
  const iw = img.width;
  const ih = img.height;
  const scale = Math.min(maxW / iw, maxH / ih, 1);
  const dw = iw * scale;
  const dh = ih * scale;
  const x = (pw - dw) / 2;
  const y = (ph - dh) / 2;
  page.drawImage(img, { x, y, width: dw, height: dh });
}

/**
 * Merges PDFs and images in order into a single PDF at `{dirname(first usable file)}/JOB FILE.PDF`.
 * Skips missing paths and files that fail to parse.
 */
async function mergePlanningJobFilesToPdf(filePathsInOrder) {
  const mergedPdf = await PdfLibDocument.create();
  let outDir = null;

  for (const fp of filePathsInOrder) {
    if (!fp || !String(fp).trim()) continue;
    const p = String(fp).trim();
    try {
      await fs.access(p);
    } catch {
      continue;
    }
    if (!outDir) outDir = path.dirname(p);
    const ext = path.extname(p).toLowerCase();
    const buf = await fs.readFile(p);
    if (ext === ".pdf") {
      try {
        const src = await PdfLibDocument.load(buf, { ignoreEncryption: true });
        const n = src.getPageCount();
        const indices = Array.from({ length: n }, (_, i) => i);
        const copied = await mergedPdf.copyPages(src, indices);
        copied.forEach((page) => mergedPdf.addPage(page));
      } catch (e) {
        console.warn("mergePlanningJobFilesToPdf: skip PDF", p, e.message);
      }
    } else {
      try {
        let embedded;
        if (ext === ".jpg" || ext === ".jpeg") {
          embedded = await mergedPdf.embedJpg(buf);
        } else if (ext === ".png") {
          embedded = await mergedPdf.embedPng(buf);
        } else {
          const pngBuf = await sharp(buf).png().toBuffer();
          embedded = await mergedPdf.embedPng(pngBuf);
        }
        planningJfAddImagePageFit(mergedPdf, embedded);
      } catch (e) {
        console.warn("mergePlanningJobFilesToPdf: skip image", p, e.message);
      }
    }
  }

  if (mergedPdf.getPageCount() === 0) {
    const err = new Error("No valid documents to combine (check files exist on disk).");
    err.code = "NO_PAGES";
    throw err;
  }
  if (!outDir) {
    const err = new Error("Could not determine output folder.");
    err.code = "NO_FOLDER";
    throw err;
  }

  const finalPath = path.join(outDir, "JOB FILE.PDF");
  const pdfBytes = await mergedPdf.save();
  await fs.writeFile(finalPath, pdfBytes);
  return finalPath;
}

// Combined JOB FILE.PDF (merge output in `7. PROPERTY INFORMATION`) — register before `/:slot` so "combined" is not treated as a slot letter
app.get("/api/files/planning-jf/:id/combined", async (req, res) => {
  try {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: "invalid id" });
    }
    if (!pool) {
      return res.status(500).json({ error: "DATABASE_URL not set" });
    }
    const projectResult = await pool.query(
      `SELECT planning_jf_job_file_pdf_path AS file_path FROM projects WHERE id = $1`,
      [projectId]
    );
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }
    const filePath = projectResult.rows[0].file_path;
    if (!filePath || !String(filePath).trim()) {
      return res.status(404).json({ error: "Job file PDF has not been created yet" });
    }
    const p = String(filePath).trim();
    const base = path.basename(p);
    if (base.toLowerCase() !== "job file.pdf") {
      return res.status(404).json({ error: "Stored path is not JOB FILE.PDF" });
    }
    try {
      await fs.access(p);
    } catch {
      return res.status(404).json({ error: "File does not exist" });
    }
    const fileBuffer = await fs.readFile(p);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="JOB FILE.PDF"`);
    res.send(fileBuffer);
  } catch (error) {
    console.error("Error serving planning JOB FILE.PDF:", error);
    res.status(500).json({ error: error.message });
  }
});

// Serve planning job file document (PDF or image) from stored full path
app.get("/api/files/planning-jf/:id/:slot", async (req, res) => {
  try {
    const projectId = Number(req.params.id);
    const slot = (req.params.slot || "").toLowerCase();
    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: "invalid id" });
    }
    if (!pool) {
      return res.status(500).json({ error: "DATABASE_URL not set" });
    }
    const col = PLANNING_JF_FILE_SLOT_COLUMNS[slot];
    const statusCol = PLANNING_JF_FILE_SLOT_STATUS_COLUMNS[slot];
    if (!col || !statusCol) {
      return res.status(400).json({ error: "invalid slot" });
    }

    const projectResult = await pool.query(
      `SELECT ${col} AS file_path, ${statusCol} AS doc_status FROM projects WHERE id = $1`,
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const row = projectResult.rows[0];
    if (String(row.doc_status || "").trim() !== "Received") {
      return res.status(404).json({ error: "Document is not in Received status" });
    }

    const filePath = row.file_path;

    if (!filePath || !String(filePath).trim()) {
      return res.status(404).json({ error: "No file for this document" });
    }

    try {
      await fs.access(filePath);
    } catch (e) {
      return res.status(404).json({ error: "File does not exist" });
    }

    const fileBuffer = await fs.readFile(filePath);
    const ct = contentTypeForPlanningJfFile(filePath);
    res.setHeader("Content-Type", ct);
    const baseName = (path.basename(filePath) || "file").replace(/"/g, "");
    res.setHeader("Content-Disposition", `inline; filename="${baseName}"`);
    res.send(fileBuffer);
  } catch (error) {
    console.error("Error serving planning JF file:", error);
    res.status(500).json({ error: error.message });
  }
});

// Combine planning job-file section uploads (a–k) into one PDF in `7. PROPERTY INFORMATION`
app.post("/api/projects/:id/planning-job-file-merge", async (req, res) => {
  try {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: "invalid id" });
    }
    if (!pool) {
      return res.status(500).json({ error: "DATABASE_URL not set" });
    }

    const selectCols = PLANNING_JF_MERGE_SLOT_ORDER.flatMap((s) => [
      PLANNING_JF_FILE_SLOT_COLUMNS[s],
      PLANNING_JF_FILE_SLOT_STATUS_COLUMNS[s],
    ]);
    const colList = selectCols.join(", ");
    const projectResult = await pool.query(`SELECT ${colList} FROM projects WHERE id = $1`, [projectId]);

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const row = projectResult.rows[0];
    const pathsOrdered = [];
    for (const slot of PLANNING_JF_MERGE_SLOT_ORDER) {
      const statusCol = PLANNING_JF_FILE_SLOT_STATUS_COLUMNS[slot];
      const pathCol = PLANNING_JF_FILE_SLOT_COLUMNS[slot];
      if (String(row[statusCol] || "").trim() !== "Received") continue;
      const v = row[pathCol];
      if (v != null && String(v).trim()) {
        pathsOrdered.push(String(v).trim());
      }
    }

    if (pathsOrdered.length === 0) {
      return res.status(400).json({ error: "No uploaded job file documents to combine." });
    }

    const outPath = await mergePlanningJobFilesToPdf(pathsOrdered);
    const base = path.basename(outPath || "");
    if (base.toLowerCase() !== "job file.pdf") {
      return res.status(500).json({ error: "Merge did not produce JOB FILE.PDF" });
    }
    await pool.query(
      `UPDATE projects SET planning_jf_job_file_pdf_path = $1, updated_at = NOW() WHERE id = $2`,
      [outPath, projectId]
    );
    return res.json({
      ok: true,
      path: outPath,
      message: `Saved JOB FILE.PDF to the property information folder.`,
    });
  } catch (error) {
    if (error.code === "NO_PAGES" || error.code === "NO_FOLDER") {
      return res.status(400).json({ error: error.message });
    }
    console.error("Error merging planning job file PDF:", error);
    return res.status(500).json({ error: error.message || "Merge failed" });
  }
});

require("./portalRoutes")(app, pool, fs);

// Serve colours PDF
app.get("/api/files/colours/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!pool) {
      return res.status(500).json({ error: "DATABASE_URL not set" });
    }

    // Get project and colours PDF location
    const projectResult = await pool.query(
      "SELECT colours_pdf_location FROM projects WHERE id = $1",
      [id]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const coloursPdfPath = resolveStoredFilesystemPath(projectResult.rows[0].colours_pdf_location);

    if (!coloursPdfPath) {
      return res.status(404).json({ error: "Colours PDF not found for this project" });
    }

    // Check if file exists
    try {
      await fs.access(coloursPdfPath);
    } catch (e) {
      return res.status(404).json({ error: "Colours PDF file does not exist" });
    }

    // Read and send the file
    const fileBuffer = await fs.readFile(coloursPdfPath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="Colours.pdf"`);
    res.send(fileBuffer);
  } catch (error) {
    console.error("Error serving colours PDF:", error);
    res.status(500).json({ error: error.message });
  }
});

// Serve generated AI exterior render PNG (saved next to colours PDF in project folder)
app.get("/api/files/ai-render/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!pool) {
      return res.status(500).json({ error: "DATABASE_URL not set" });
    }
    const projectResult = await pool.query(
      "SELECT drawings_pdf_location, colours_pdf_location FROM projects WHERE id = $1",
      [id]
    );
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }
    const row = projectResult.rows[0];
    const projectDir = projectDirectoryFromColoursOrDrawings(row.colours_pdf_location, row.drawings_pdf_location);
    if (!projectDir) {
      return res.status(404).json({ error: "No project folder resolved for this render" });
    }
    const abs = path.join(projectDir, AI_RENDER_FILENAME);
    try {
      await fs.access(abs);
    } catch {
      return res.status(404).json({ error: "AI render has not been generated yet." });
    }
    const img = await fs.readFile(abs);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `inline; filename="${AI_RENDER_FILENAME}"`);
    res.send(img);
  } catch (error) {
    console.error("Error serving AI render:", error);
    res.status(500).json({ error: error.message });
  }
});

// Folder layout always uses a 4-digit YEAR segment: <root>/<YYYY>/<STATE>/...
// projects.year stores a full date (YYYY-MM-DD) or legacy year; never use the full date as a path segment.
function getProjectYearFolderSegment(yearValue) {
  if (yearValue == null || yearValue === "") {
    return String(new Date().getFullYear());
  }
  if (yearValue instanceof Date) {
    const y = yearValue.getFullYear();
    if (Number.isFinite(y)) return String(y);
  }
  const raw = String(yearValue).trim();
  // ISO date / datetime: 2026-03-16 or 2026-03-16T12:00:00.000Z
  const iso = raw.match(/^(\d{4})-\d{2}-\d{2}/);
  if (iso) return iso[1];
  // Already a 4-digit year only
  if (/^\d{4}$/.test(raw)) return raw;
  // Fallback: first 20xx / 19xx in the string
  const anyYear = raw.match(/\b(19|20)\d{2}\b/);
  if (anyYear) return anyYear[0];
  return String(new Date().getFullYear());
}

const SITE_VISIT_IMAGE_EXT = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
  ".heic",
  ".heif",
  ".tif",
  ".tiff",
]);

const SITE_VISIT_HEIC_LIKE_EXT = new Set([".heic", ".heif"]);

function isSiteVisitListableImage(filename) {
  return SITE_VISIT_IMAGE_EXT.has(path.extname(filename).toLowerCase());
}

function guessSiteVisitImageContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
  };
  return map[ext] || "application/octet-stream";
}

/** HEIC→JPEG: try sharp first, then `heic-convert` (works when libvips lacks HEIF, e.g. many Windows installs). */
async function siteVisitHeicFileToJpegBuffer(filePath) {
  const inputBuffer = await fs.readFile(filePath);
  try {
    return await sharp(inputBuffer).rotate().jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  } catch (e1) {
    console.warn(
      "sitevisit HEIC→JPEG sharp failed, trying heic-convert:",
      e1?.message || e1
    );
  }
  const convert = require("heic-convert");
  const out = await convert({ buffer: inputBuffer, format: "JPEG", quality: 0.88 });
  if (Buffer.isBuffer(out)) return out;
  if (out instanceof ArrayBuffer) return Buffer.from(out);
  return Buffer.from(out);
}

function resolveSiteVisitPhotoFilePath(photosDirNorm, name) {
  const base = path.basename(name);
  if (!base || base === "." || base === "..") return null;
  const full = path.resolve(photosDirNorm, base);
  const dirNorm = path.resolve(photosDirNorm);
  const rel = path.relative(dirNorm, full);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return full;
}

/** Safari/iOS often sends HEIC (or octet-stream) without a reliable image/* mimetype. */
function isSiteVisitUploadImageFile(file) {
  const mime = (file.mimetype || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  const ext = path.extname(file.originalname || "").toLowerCase();
  const allowedExt = new Set([
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".bmp",
    ".heic",
    ".heif",
    ".tif",
    ".tiff",
  ]);
  return allowedExt.has(ext);
}

/** Under `5. PHOTOS`: pre-construction site photos vs construction photos. */
const SITE_VISIT_PHOTO_SUBFOLDERS = {
  pre: "Pre-Construction -Site Photos",
  construction: "Construction Photos",
};

function normalizeSiteVisitPhotoSet(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "construction") return "construction";
  return "pre";
}

/** Prefer `photoSet` (avoids ambiguous `set` in caches/proxies); still accept `set` / `folder`. */
function siteVisitPhotoSetFromRequest(req) {
  const q = req.query || {};
  const raw = q.photoSet ?? q.set ?? q.folder;
  return normalizeSiteVisitPhotoSet(raw);
}

async function resolveSiteVisitPhotosDir(projectId, photoSetKey) {
  if (!pool) {
    return { ok: false, status: 500, error: "Database not configured" };
  }
  if (!projectId) {
    return { ok: false, status: 400, error: "Missing projectId" };
  }
  const setKey = normalizeSiteVisitPhotoSet(photoSetKey);
  const subfolder = SITE_VISIT_PHOTO_SUBFOLDERS[setKey];
  if (!subfolder) {
    return { ok: false, status: 400, error: "Invalid photo set" };
  }

  const projectResult = await pool.query(
    "SELECT suburb, street, state, year FROM projects WHERE id = $1",
    [projectId]
  );
  if (projectResult.rows.length === 0) {
    return { ok: false, status: 404, error: "Project not found" };
  }
  const proj = projectResult.rows[0];
  const stateUpper = (proj.state || "").toString().toUpperCase();
  if (!stateUpper) {
    return { ok: false, status: 400, error: "Project state is required" };
  }

  const settingsResult = await pool.query(
    "SELECT root_directory, root_directory_qld FROM settings WHERE id = 1"
  );
  const settingsRow = settingsResult.rows[0];
  const rootDir =
    stateUpper === "QLD"
      ? settingsRow?.root_directory_qld || settingsRow?.root_directory
      : settingsRow?.root_directory;
  if (!rootDir) {
    return { ok: false, status: 500, error: "Root directory not configured in settings" };
  }

  const projectYear = getProjectYearFolderSegment(proj.year);
  const projectFolderName = buildJobProjectFolderName(proj.suburb, proj.street);

  const photosDir = path.join(
    rootDir,
    projectYear,
    stateUpper,
    projectFolderName,
    "5. PHOTOS",
    subfolder
  );
  const photosDirNorm = path.resolve(photosDir);
  try {
    const st = await fs.stat(photosDirNorm);
    if (!st.isDirectory()) {
      return {
        ok: false,
        status: 400,
        error: "Target photo folder does not exist",
        photosDirNorm,
      };
    }
  } catch {
    return {
      ok: false,
      status: 400,
      error: "Target photo folder does not exist",
      photosDirNorm,
    };
  }
  return { ok: true, photosDirNorm };
}

async function resolveSiteVisitPreConstructionPhotosDir(projectId) {
  return resolveSiteVisitPhotosDir(projectId, "pre");
}

const siteVisitUploadTempDir = path.join(__dirname, "temp-sitevisit-uploads");
const siteVisitPhotoUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      try {
        fsSync.mkdirSync(siteVisitUploadTempDir, { recursive: true });
      } catch (e) {
        return cb(e);
      }
      cb(null, siteVisitUploadTempDir);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname || "") || "";
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
    },
  }),
  limits: { fileSize: 30 * 1024 * 1024, files: 40 },
});

function siteVisitPhotoUploadMiddleware(req, res, next) {
  siteVisitPhotoUpload.array("photos", 40)(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "File too large (max 30MB per photo)" });
      }
      if (err.code === "LIMIT_FILE_COUNT") {
        return res.status(400).json({ error: "Too many files (max 40 per upload)" });
      }
      if (err.code === "LIMIT_PART_COUNT") {
        return res.status(400).json({
          error: "Upload has too many parts; try fewer photos at once",
        });
      }
      if (err.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({ error: "Unexpected upload field" });
      }
      return res.status(400).json({ error: err.message || "Upload error" });
    }
    console.error("sitevisit upload multipart:", err);
    return res.status(500).json({ error: "Upload failed" });
  });
}

app.post(
  "/api/sitevisit/upload-photo",
  siteVisitPhotoUploadMiddleware,
  async (req, res) => {
    if (!pool) {
      return res.status(500).json({ error: "Database not configured" });
    }
    const unlinkTemp = async (p) => {
      if (!p) return;
      try {
        await fs.unlink(p);
      } catch {
        /* ignore */
      }
    };
    const cleanupAllTemps = async () => {
      for (const f of req.files || []) {
        await unlinkTemp(f?.path);
      }
    };
    try {
      const files = req.files || [];
      if (files.length === 0) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      const projectId = req.body?.projectId;
      if (!projectId) {
        await cleanupAllTemps();
        return res.status(400).json({ error: "Missing projectId" });
      }

      const resolvedDir = await resolveSiteVisitPreConstructionPhotosDir(projectId);
      if (!resolvedDir.ok) {
        await cleanupAllTemps();
        return res.status(resolvedDir.status).json({ error: resolvedDir.error });
      }
      const { photosDirNorm } = resolvedDir;

      const uploaded = [];
      const failed = [];

      for (const file of files) {
        const displayName = file.originalname || "photo";
        if (!isSiteVisitUploadImageFile(file)) {
          await unlinkTemp(file.path);
          failed.push({ name: displayName, error: "Only image files are allowed" });
          continue;
        }

        const safeName = path.basename(file.originalname || "photo");
        if (!safeName || safeName === "." || safeName === "..") {
          await unlinkTemp(file.path);
          failed.push({ name: displayName, error: "Invalid file name" });
          continue;
        }
        const finalPath = path.join(photosDirNorm, safeName);
        try {
          await fs.access(finalPath);
          await unlinkTemp(file.path);
          failed.push({ name: displayName, error: "A file with that name already exists" });
          continue;
        } catch {
          /* target name is free */
        }

        try {
          await fs.rename(file.path, finalPath);
        } catch (e) {
          if (e.code === "EXDEV") {
            try {
              await fs.copyFile(file.path, finalPath);
              await fs.unlink(file.path);
            } catch (e2) {
              await unlinkTemp(file.path);
              console.error("sitevisit upload-photo copy:", e2);
              failed.push({ name: displayName, error: "Upload failed" });
              continue;
            }
          } else {
            await unlinkTemp(file.path);
            if (e.code === "EEXIST") {
              failed.push({ name: displayName, error: "A file with that name already exists" });
            } else {
              console.error("sitevisit upload-photo rename:", e);
              failed.push({ name: displayName, error: "Upload failed" });
            }
            continue;
          }
        }

        uploaded.push({ name: safeName, path: finalPath });
      }

      const ok = uploaded.length > 0;
      if (!ok && failed.length > 0) {
        const firstErr = failed[0]?.error || "Upload failed";
        return res.status(400).json({
          error: failed.length === 1 ? firstErr : "All uploads failed",
          uploaded,
          failed,
        });
      }

      res.json({ success: true, uploaded, failed });
    } catch (err) {
      await cleanupAllTemps();
      console.error("POST /api/sitevisit/upload-photo:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

app.get("/api/sitevisit/photos", async (req, res) => {
  try {
    const projectId = req.query.projectId;
    if (!projectId) {
      return res.status(400).json({ error: "Missing projectId" });
    }
    const photoSet = siteVisitPhotoSetFromRequest(req);
    const resolved = await resolveSiteVisitPhotosDir(projectId, photoSet);
    if (!resolved.ok) {
      if (resolved.error === "Target photo folder does not exist") {
        return res.json({ files: [] });
      }
      return res.status(resolved.status).json({ error: resolved.error });
    }
    const entries = await fs.readdir(resolved.photosDirNorm, { withFileTypes: true });
    const files = [];
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      if (!isSiteVisitListableImage(ent.name)) continue;
      files.push({ name: ent.name });
    }
    files.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
    res.json({ files });
  } catch (err) {
    console.error("GET /api/sitevisit/photos:", err);
    res.status(500).json({ error: "Failed to list photos" });
  }
});

app.get("/api/sitevisit/photo-file", async (req, res) => {
  try {
    const projectId = req.query.projectId;
    const name = req.query.name;
    if (!projectId) {
      return res.status(400).json({ error: "Missing projectId" });
    }
    if (name === undefined || name === null || String(name).trim() === "") {
      return res.status(400).json({ error: "Missing name" });
    }
    const photoSet = siteVisitPhotoSetFromRequest(req);
    const resolved = await resolveSiteVisitPhotosDir(projectId, photoSet);
    if (!resolved.ok) {
      if (resolved.error === "Target photo folder does not exist") {
        return res.status(404).json({ error: "Not found" });
      }
      return res.status(resolved.status).json({ error: resolved.error });
    }
    const filePath = resolveSiteVisitPhotoFilePath(resolved.photosDirNorm, name);
    if (!filePath) {
      return res.status(400).json({ error: "Invalid file name" });
    }
    let st;
    try {
      st = await fs.stat(filePath);
    } catch {
      return res.status(404).json({ error: "Not found" });
    }
    if (!st.isFile()) {
      return res.status(404).json({ error: "Not found" });
    }
    if (!isSiteVisitListableImage(filePath)) {
      return res.status(404).json({ error: "Not found" });
    }
    const extLower = path.extname(filePath).toLowerCase();
    // Browsers (except some Safari builds) won't show HEIC in <img>; serve JPEG when sharp can decode.
    if (SITE_VISIT_HEIC_LIKE_EXT.has(extLower)) {
      try {
        const jpegBuf = await siteVisitHeicFileToJpegBuffer(filePath);
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "private, max-age=300");
        return res.send(jpegBuf);
      } catch (heicErr) {
        console.warn(
          "sitevisit photo-file HEIC→JPEG (sharp + heic-convert) failed, sending original:",
          heicErr?.message || heicErr
        );
      }
    }
    res.setHeader("Content-Type", guessSiteVisitImageContentType(filePath));
    res.setHeader("Cache-Control", "private, max-age=120");
    fsSync.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error("GET /api/sitevisit/photo-file:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to read file" });
    }
  }
});

const VARIATIONS_CONTRACT_ADMIN_FOLDER =
  "3. CONTRACT ADMIN - Quotations, Contract, E-Contracts,Variations";

async function resolveVariationsDirectory(projectPath) {
  const exactVariations = path.join(
    projectPath,
    VARIATIONS_CONTRACT_ADMIN_FOLDER,
    "Variations"
  );
  try {
    await fs.access(exactVariations);
    return {
      variationsPath: exactVariations,
      contractAdminFolder: VARIATIONS_CONTRACT_ADMIN_FOLDER,
      method: "exact",
    };
  } catch {
    // ignore
  }

  let dirEntries;
  try {
    dirEntries = await fs.readdir(projectPath, { withFileTypes: true });
  } catch (e) {
    return {
      variationsPath: null,
      contractAdminFolder: null,
      method: null,
      projectPathError: e.message,
    };
  }

  for (const ent of dirEntries) {
    if (!ent.isDirectory()) continue;
    const name = ent.name;
    const lower = name.toLowerCase();
    if (
      lower.startsWith("3.") &&
      lower.includes("contract") &&
      lower.includes("admin")
    ) {
      const candidate = path.join(projectPath, name, "Variations");
      try {
        await fs.access(candidate);
        return {
          variationsPath: candidate,
          contractAdminFolder: name,
          method: "scanned_contract_admin",
        };
      } catch {
        // try next
      }
    }
  }

  return {
    variationsPath: null,
    contractAdminFolder: null,
    method: null,
  };
}

async function listAllFilesRecursive(rootDir, baseDir = rootDir) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listAllFilesRecursive(full, baseDir)));
    } else if (entry.isFile()) {
      const rel = path.relative(baseDir, full);
      try {
        const stats = await fs.stat(full);
        out.push({
          name: rel.split(path.sep).join("/"),
          size: stats.size,
          modified: stats.mtime,
        });
      } catch (e) {
        console.error(`Error getting stats for ${full}:`, e);
      }
    }
  }
  return out;
}

/** Resolve Variations folder for a project (shared by list + open file). */
async function getVariationsFolderForProjectId(projectId) {
  if (!pool) {
    return { ok: false, status: 500, message: "DATABASE_URL not set" };
  }

  const projectResult = await pool.query(
    "SELECT suburb, street, state, year FROM projects WHERE id = $1",
    [projectId]
  );

  if (projectResult.rows.length === 0) {
    return { ok: false, status: 404, message: "Project not found" };
  }

  const project = projectResult.rows[0];
  const { suburb, street, state, year } = project;

  if (!suburb || !street || !state || !year) {
    return {
      ok: false,
      status: 400,
      message:
        "Project missing required fields (suburb, street, state, year)",
    };
  }

  const settingsResult = await pool.query(
    "SELECT root_directory, root_directory_qld FROM settings WHERE id = 1"
  );

  if (settingsResult.rows.length === 0) {
    return { ok: false, status: 500, message: "Settings not found" };
  }

  const stateUpper = (state || "").toString().toUpperCase();
  const rootDir =
    stateUpper === "QLD"
      ? settingsResult.rows[0].root_directory_qld ||
        settingsResult.rows[0].root_directory
      : settingsResult.rows[0].root_directory;

  if (!rootDir) {
    return { ok: false, status: 500, message: "Root directory not configured" };
  }

  const projectYearFolder = getProjectYearFolderSegment(year);
  const projectFolderName = buildJobProjectFolderName(suburb, street);
  const projectPath = path.join(rootDir, projectYearFolder, stateUpper, projectFolderName);

  const resolved = await resolveVariationsDirectory(projectPath);
  const variationsFolderPath = resolved.variationsPath;
  const attemptedExactPath = path.join(
    projectPath,
    VARIATIONS_CONTRACT_ADMIN_FOLDER,
    "Variations"
  );

  return {
    ok: true,
    variationsFolderPath,
    projectPath,
    projectYearFolder,
    attemptedExactPath,
    resolved,
  };
}

function parseVariationPriceToNumber(price) {
  if (price == null || price === "") return NaN;
  const s = String(price).trim();
  if (s === "—" || s === "-") return NaN;
  const cleaned = s.replace(/[$,\s]/g, "");
  if (cleaned === "") return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function buildVariationRowsFromItems(items) {
  const rows = [];
  let grandTotal = 0;
  if (!Array.isArray(items)) {
    return {
      rows,
      grandTotal,
      grandTotalStr: "$0.00",
    };
  }
  for (const raw of items) {
    const product = raw?.product != null ? String(raw.product) : "—";
    const qtyRaw = raw?.quantity;
    const q = Number.parseInt(String(qtyRaw), 10);
    const qty = Number.isFinite(q) && q >= 1 ? q : 1;
    const unit = parseVariationPriceToNumber(raw?.price);
    const line = Number.isFinite(unit) ? unit * qty : 0;
    grandTotal += line;
    const unitStr = Number.isFinite(unit)
      ? `$${unit.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "—";
    const lineStr = Number.isFinite(unit)
      ? `$${line.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "—";
    rows.push({ product, qty, unitStr, lineStr });
  }
  const grandTotalStr = `$${grandTotal.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return { rows, grandTotal, grandTotalStr };
}

function escapeHtmlPlain(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Same as other emails: only true / "true" means the contact is included. */
function isClientContactActive(v) {
  return v === true || v === "true";
}

/** Emails for contacts 1–3 where the Client Info checkbox is on and an email is set. */
function collectActiveClientEmails(pr) {
  const out = [];
  const add = (email) => {
    const e = email != null && String(email).trim() !== "" ? String(email).trim() : "";
    if (e && !out.includes(e)) out.push(e);
  };
  if (isClientContactActive(pr?.client1_active)) add(pr?.client1_email);
  if (isClientContactActive(pr?.client2_active)) add(pr?.client2_email);
  if (isClientContactActive(pr?.client3_active)) add(pr?.client3_email);
  return out;
}

function normalizeEmailRecipients(to) {
  if (Array.isArray(to)) {
    return to.map((e) => String(e).trim()).filter(Boolean);
  }
  if (typeof to === "string" && to.includes(",")) {
    return to
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
  }
  if (typeof to === "string" && to.trim()) {
    return [to.trim()];
  }
  return [];
}

async function sendVariationApprovedPdfEmail({ to, from, subject, pdfBuffer, filename }) {
  const recipients = normalizeEmailRecipients(to);
  if (recipients.length === 0) {
    throw new Error("No recipient addresses.");
  }
  const smtpCreds = await getSmtpCredentialsForFromAddress(from);
  const smtpUser = smtpCreds.smtpUser;
  const smtpPass = smtpCreds.smtpPass;
  if (!smtpUser || !smtpPass) {
    throw new Error("SMTP not configured for the From address.");
  }
  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true";
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user: smtpUser, pass: smtpPass },
  });
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;"><p>Your variation request has been <strong>approved</strong>. The stamped PDF is attached.</p></body></html>`;
  await transporter.sendMail({
    from,
    to: recipients,
    subject,
    html,
    attachments: [
      {
        filename: filename || "Variation APPROVED.pdf",
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}

/** Send the draft variation PDF to active client contacts when "Create variation" runs. */
async function sendVariationDraftPdfEmail({ to, from, subject, pdfBuffer, filename, projectName }) {
  const recipients = normalizeEmailRecipients(to);
  if (recipients.length === 0) return;
  const smtpCreds = await getSmtpCredentialsForFromAddress(from);
  const smtpUser = smtpCreds.smtpUser;
  const smtpPass = smtpCreds.smtpPass;
  if (!smtpUser || !smtpPass) {
    throw new Error("SMTP not configured for the From address.");
  }
  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true";
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user: smtpUser, pass: smtpPass },
  });
  const safeName = escapeHtmlPlain(projectName || "your project");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;"><p>Please find attached the variation request for <strong>${safeName}</strong>.</p><p>Open the PDF and use the green <strong>Approve</strong> bar when you are ready to confirm. You will receive the approved copy by email.</p></body></html>`;
  await transporter.sendMail({
    from,
    to: recipients,
    subject,
    html,
    attachments: [
      {
        filename: filename || "Variation TEST.pdf",
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}

const VARIATION_PDF_FILENAME_TEST = "Variation TEST.pdf";
const VARIATION_PDF_FILENAME_APPROVED = "Variation APPROVED.pdf";

/** Normalize Windows paths so fs can open them (e.g. Z:folder → Z:\folder). */
function normalizeWindowsFilePath(p) {
  if (p == null || typeof p !== "string") return "";
  let s = p.trim();
  if (!s) return "";
  s = path.normalize(s);
  if (/^[A-Za-z]:[^\\/]/.test(s)) {
    s = s.replace(/^([A-Za-z]:)([^\\/])/, "$1\\$2");
  }
  return s;
}

/**
 * Variation PDF header image: uses letterhead_path only when set (no email-logo fallback then).
 * If letterhead is blank, uses email_logo_path. Paths are normalized for Windows.
 */
async function loadVariationPdfHeaderBuffer(pool) {
  const logoRes = await pool.query(
    "SELECT letterhead_path, email_logo_path FROM settings WHERE id = 1"
  );
  const row = logoRes.rows[0] || {};
  const letterheadRaw = row.letterhead_path;
  const emailLogoRaw = row.email_logo_path;
  const letterheadPath =
    letterheadRaw != null && String(letterheadRaw).trim() !== ""
      ? String(letterheadRaw).trim()
      : "";
  const emailLogoPath =
    emailLogoRaw != null && String(emailLogoRaw).trim() !== ""
      ? String(emailLogoRaw).trim()
      : "";

  const readFileNormalized = async (rawPath) => {
    const normalized = normalizeWindowsFilePath(rawPath);
    if (!normalized) return null;
    await fs.access(normalized);
    const buf = await fs.readFile(normalized);
    return buf && buf.length > 0 ? buf : null;
  };

  if (letterheadPath) {
    try {
      const buf = await readFileNormalized(letterheadPath);
      if (buf) {
        console.log(
          "Variation PDF: header image = letterhead_path",
          normalizeWindowsFilePath(letterheadPath)
        );
        return buf;
      }
    } catch (e) {
      console.error(
        "Variation PDF: letterhead_path set but unreadable:",
        normalizeWindowsFilePath(letterheadPath),
        e.message
      );
    }
    return null;
  }

  if (emailLogoPath) {
    try {
      const buf = await readFileNormalized(emailLogoPath);
      if (buf) {
        console.log(
          "Variation PDF: header image = email_logo_path (no letterhead configured)",
          normalizeWindowsFilePath(emailLogoPath)
        );
        return buf;
      }
    } catch (e) {
      console.warn("Variation PDF: email_logo_path unreadable:", e.message);
    }
  }
  return null;
}

const VARIATION_INTRO_TEXT =
  "We request the following variations be applied to our new home/granny flat over and above the standard specifications / inclusions. We acknowledge payment will be due for these variations from 'Next' stage of construction as invoiced by Superior Granny Flats";

const VARIATION_NOTE_TEXT =
  'Note: This variation request becomes an "Authority for Variation to Contract" once signed by Owners and by authorised Superior Granny Flats representative. Not valid unless signed by both parties. It is the responsibility of the Owner/s to check all variations prior to signing. Superior Granny Flats holds no responsibility for omitted items or superseded inclusions.';

/** Allow only http(s) origins for links in emails (no javascript:, etc.). */
function sanitizeHttpBaseUrl(raw) {
  if (raw == null) return "";
  const s = String(raw).trim().replace(/\/+$/, "");
  if (s.length < 10 || s.length > 512) return "";
  if (!/^https?:\/\//i.test(s)) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

/**
 * Sync fallback chain for outbound links (when DB setting is unset).
 * Priority: linkBaseUrl / appBaseUrl in body → PUBLIC_APP_URL → Origin → Host.
 */
function getPublicBaseUrl(req, body) {
  const b = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const fromBody = sanitizeHttpBaseUrl(b.linkBaseUrl || b.appBaseUrl);
  if (fromBody) return fromBody;

  const env = process.env.PUBLIC_APP_URL;
  if (env && String(env).trim()) {
    const cleaned = sanitizeHttpBaseUrl(env);
    if (cleaned) return cleaned;
  }

  const originHdr = sanitizeHttpBaseUrl(req.get("origin"));
  if (originHdr) return originHdr;

  const proto = req.get("x-forwarded-proto") || req.protocol || "http";
  const host = req.get("host") || "localhost";
  return `${proto}://${host}`;
}

/**
 * Prefer: PUBLIC_APP_URL → live portal hostname → sender browser/origin fallback.
 * The portal default avoids embedding localhost/private IPs from whoever clicked Send.
 */
async function resolveEmailAppPublicBase(pool, req, body) {
  const envClean = sanitizeHttpBaseUrl(process.env.PUBLIC_APP_URL);
  if (envClean) return envClean;

  const portalDefault = sanitizeHttpBaseUrl(DEFAULT_EMAIL_PUBLIC_APP_ORIGIN);
  if (portalDefault) return portalDefault;

  return getPublicBaseUrl(req, body);
}

/** Large diagonal green stamp on top of the page (call after all content). */
function drawVariationApprovedWatermark(doc) {
  const w = doc.page.width;
  const h = doc.page.height;
  doc.save();
  doc.fillColor("#2e7d32").opacity(0.16);
  doc.font("Helvetica-Bold").fontSize(58);
  doc.rotate(-30, { origin: [w / 2, h / 2] });
  doc.text("APPROVED", w / 2 - 200, h / 2 - 24, { width: 400, align: "center" });
  doc.restore();
}

function buildVariationListPdfBuffer({
  logoBuffer,
  projectName,
  clientName,
  clientEmail,
  clientPhone,
  dateStr,
  consultantName,
  rows,
  grandTotal,
  approvalUrl = null,
  approvedStamp = false,
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.margins.right;
    const contentW = doc.page.width - left - right;
    const pageH = doc.page.height;
    const bottomM = doc.page.margins.bottom;

    let y = doc.page.margins.top;

    const val = (v) => (v != null && String(v).trim() !== "" ? String(v) : "—");

    if (logoBuffer && Buffer.isBuffer(logoBuffer) && logoBuffer.length > 0) {
      try {
        doc.y = y;
        doc.image(logoBuffer, left, y, { fit: [contentW, 280] });
        y = doc.y + 32;
      } catch (imgErr) {
        console.warn("Variation PDF: letterhead skipped:", imgErr.message);
      }
    }

    doc.font("Helvetica").fontSize(16).fillColor("#323233");
    doc.text("Variation", left, y, { width: contentW, align: "center" });
    y += doc.heightOfString("Variation", { width: contentW }) + (approvedStamp ? 6 : 14);
    if (approvedStamp) {
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#1b5e20");
      doc.text("APPROVED", left, y, { width: contentW, align: "center" });
      y += doc.heightOfString("APPROVED", { width: contentW }) + 10;
    }

    const infoPad = 10;
    const infoBoxTop = y;
    doc.font("Helvetica").fontSize(10).fillColor("#323233");
    const infoLines = [
      `Project Name: ${val(projectName)}`,
      `Client Name: ${val(clientName)}`,
      `Client Email: ${val(clientEmail)}`,
      `Client Phone: ${val(clientPhone)}`,
      `Date: ${val(dateStr)}`,
      `Consultant: ${val(consultantName)}`,
    ];
    let infoY = infoBoxTop + infoPad;
    infoLines.forEach((line) => {
      doc.text(line, left + infoPad, infoY, { width: contentW - 2 * infoPad });
      infoY += doc.heightOfString(line, { width: contentW - 2 * infoPad }) + 4;
    });
    const infoBoxBottom = infoY + infoPad;
    doc.rect(left, infoBoxTop, contentW, infoBoxBottom - infoBoxTop).stroke("#cccccc");
    y = infoBoxBottom + 16;

    doc.font("Helvetica").fontSize(10).fillColor("#323233");
    const introH = doc.heightOfString(VARIATION_INTRO_TEXT, {
      width: contentW,
      lineGap: 2,
    });
    doc.text(VARIATION_INTRO_TEXT, left, y, { width: contentW, lineGap: 2 });
    y += introH + 18;

    doc.font("Helvetica-Oblique").fontSize(8).fillColor("#323233");
    const notePad = 8;
    const noteInnerW = contentW - 2 * notePad;
    const noteTextH = doc.heightOfString(VARIATION_NOTE_TEXT, {
      width: noteInnerW,
      lineGap: 1,
    });
    const noteBoxH = noteTextH + 2 * notePad;
    const gapPriceToNote = 14;
    const gapApproveToNote = approvalUrl ? 8 : 0;
    const approveStripH = approvalUrl ? 38 : 0;
    const noteTop = pageH - bottomM - noteBoxH;
    const priceBoxBottom = noteTop - gapApproveToNote - approveStripH - gapPriceToNote;

    const priceBoxTop = y;
    let priceBoxH = priceBoxBottom - priceBoxTop;
    if (priceBoxH < 72) {
      priceBoxH = 72;
    }
    if (priceBoxTop + priceBoxH > priceBoxBottom) {
      priceBoxH = Math.max(48, priceBoxBottom - priceBoxTop);
    }

    const pricePad = 10;
    const totalGapAbove = 12;
    doc.font("Helvetica").fontSize(12).fillColor("#1b5e20");
    const totalStr = `Grand Total (inc GST):  ${grandTotal}`;
    const totalH = doc.heightOfString(totalStr, {
      width: contentW - 2 * pricePad,
      align: "right",
    });
    const totalY = priceBoxTop + priceBoxH - pricePad - totalH;
    const listMaxBottom = totalY - totalGapAbove;

    doc.rect(left, priceBoxTop, contentW, priceBoxH).stroke("#cccccc");

    const innerLeft = left + pricePad;
    const innerW = contentW - 2 * pricePad;
    const colQty = 42;
    const colUnit = 108;
    const colTot = 108;
    const colProduct = Math.max(120, innerW - colQty - colUnit - colTot);
    const xP = innerLeft;
    const xQ = xP + colProduct;
    const xU = xQ + colQty;
    const xT = xU + colUnit;

    let listY = priceBoxTop + pricePad;
    const headerH = 12;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#323233");
    doc.text("Product name", xP, listY, { width: colProduct });
    doc.text("QTY", xQ, listY, { width: colQty, align: "center" });
    doc.text("Price (per unit)", xU, listY, { width: colUnit, align: "right" });
    doc.text("Total", xT, listY, { width: colTot, align: "right" });
    listY += headerH + 2;
    doc.moveTo(innerLeft, listY).lineTo(innerLeft + innerW, listY).stroke("#cccccc");
    listY += 8;

    doc.font("Helvetica").fontSize(9).fillColor("#323233");
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const prod = r.product != null ? String(r.product) : "—";
      const hProd = doc.heightOfString(prod, { width: colProduct, lineGap: 1 });
      const rowH = Math.max(hProd, 14) + 5;
      if (listY + rowH > listMaxBottom) {
        break;
      }
      const rowTop = listY;
      doc.text(prod, xP, rowTop, { width: colProduct, lineGap: 1 });
      doc.text(String(r.qty), xQ, rowTop, { width: colQty, align: "center" });
      doc.text(r.unitStr, xU, rowTop, { width: colUnit, align: "right" });
      doc.text(r.lineStr, xT, rowTop, { width: colTot, align: "right" });
      listY += rowH;
    }

    doc.font("Helvetica-Bold").fontSize(12).fillColor("#1b5e20");
    doc.text(totalStr, left + pricePad, totalY, {
      width: contentW - 2 * pricePad,
      align: "right",
    });

    if (approvalUrl) {
      const approveTop = priceBoxBottom + gapPriceToNote;
      doc.save();
      doc.fillColor("#e8f5e9").rect(left, approveTop, contentW, approveStripH).fill();
      doc.fillColor("#1b5e20").font("Helvetica-Bold").fontSize(10);
      doc.text(
        "Approve — click here to confirm this variation",
        left + 6,
        approveTop + 11,
        { width: contentW - 12, align: "center" }
      );
      doc.link(left, approveTop, contentW, approveStripH, approvalUrl);
      doc.restore();
    }

    doc.rect(left, noteTop, contentW, noteBoxH).stroke("#cccccc");
    doc.font("Helvetica-Oblique").fontSize(8).fillColor("#323233");
    doc.text(VARIATION_NOTE_TEXT, left + notePad, noteTop + notePad, {
      width: noteInnerW,
      lineGap: 1,
    });

    if (approvedStamp) {
      drawVariationApprovedWatermark(doc);
    }

    doc.end();
  });
}

// Create variation list PDF in project folder as "Variation TEST.pdf", email active Client Info contacts, optional approve link
app.post("/api/projects/:id/variations/create-pdf", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  const projectId = Number(req.params.id);
  if (!Number.isFinite(projectId)) {
    return res.status(400).json({ error: "invalid project id" });
  }
  const { items, consultantName } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Add at least one line item" });
  }
  const consultantTrimmed =
    consultantName != null && String(consultantName).trim() !== ""
      ? String(consultantName).trim()
      : "";
  if (!consultantTrimmed) {
    return res.status(400).json({ error: "Consultant is required" });
  }

  try {
    const ctx = await getVariationsFolderForProjectId(projectId);
    if (!ctx.ok) {
      return res.status(ctx.status).json({ error: ctx.message });
    }
    const { projectPath } = ctx;
    const projectResult = await pool.query(
      `SELECT name, client1_name, client1_email, client1_phone,
       client1_active, client2_email, client2_active, client3_email, client3_active
       FROM projects WHERE id = $1`,
      [projectId]
    );
    const pr = projectResult.rows[0] || {};
    const projectName = pr.name != null && String(pr.name).trim() !== "" ? String(pr.name) : `Project ${projectId}`;

    const activeClientEmails = collectActiveClientEmails(pr);
    const notifyTrim = activeClientEmails.join(", ");

    let logoBuffer = null;
    try {
      logoBuffer = await loadVariationPdfHeaderBuffer(pool);
    } catch (logoErr) {
      console.warn("Variation PDF: header image load failed:", logoErr.message);
    }

    const { rows, grandTotalStr } = buildVariationRowsFromItems(items);

    let approvalUrl = null;
    if (notifyTrim) {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await pool.query(
        `INSERT INTO variation_approval_tokens (token, project_id, items_json, consultant_name, notify_email, expires_at)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6)`,
        [token, projectId, JSON.stringify(items), consultantTrimmed, notifyTrim, expiresAt]
      );
      const base = await resolveEmailAppPublicBase(pool, req, req.body);
      approvalUrl = `${base}/api/projects/variations/approve?token=${encodeURIComponent(token)}`;
    }

    const dateStr = new Date().toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const pdfBuffer = await buildVariationListPdfBuffer({
      logoBuffer,
      projectName,
      clientName: pr.client1_name,
      clientEmail: pr.client1_email,
      clientPhone: pr.client1_phone,
      dateStr,
      consultantName: consultantTrimmed,
      rows,
      grandTotal: grandTotalStr,
      approvalUrl,
    });

    const outName = VARIATION_PDF_FILENAME_TEST;
    const outPath = path.join(projectPath, outName);
    await fs.writeFile(outPath, pdfBuffer);

    let emailSent = false;
    let emailError = null;
    if (activeClientEmails.length > 0) {
      try {
        const settingsFrom = await pool.query(`SELECT smtp_user_1 FROM settings WHERE id = 1`);
        const fromAddr =
          (settingsFrom.rows[0]?.smtp_user_1 && String(settingsFrom.rows[0].smtp_user_1).trim()) ||
          process.env.SMTP_USER ||
          "info@superiorgrannyflats.com.au";
        await sendVariationDraftPdfEmail({
          to: activeClientEmails,
          from: fromAddr,
          subject: `Variation request — ${projectName}`,
          pdfBuffer,
          filename: outName,
          projectName,
        });
        emailSent = true;
      } catch (mailErr) {
        console.error("Variation draft email:", mailErr);
        emailError = mailErr.message || "Email failed";
      }
    }

    res.json({
      success: true,
      path: outPath,
      filename: outName,
      approvalLinkIncluded: !!approvalUrl,
      emailedTo: activeClientEmails,
      emailSent,
      emailError,
    });
  } catch (e) {
    console.error("create-pdf variations:", e);
    res.status(500).json({ error: e.message || "Failed to create PDF" });
  }
});

// Public: open from PDF link — stamps APPROVED, saves file, emails PDF to notify address
app.get("/api/projects/variations/approve", async (req, res) => {
  if (!pool) return res.status(500).send("Server misconfigured");
  const token = req.query.token;
  if (!token || typeof token !== "string") {
    res.set("Content-Type", "text/html; charset=utf-8");
    return res.status(400).send("<!DOCTYPE html><html><body><p>Missing token.</p></body></html>");
  }

  try {
    const tokRes = await pool.query(
      `SELECT token, project_id, items_json, consultant_name, notify_email, expires_at, used_at
       FROM variation_approval_tokens WHERE token = $1`,
      [token]
    );
    if (tokRes.rows.length === 0) {
      res.set("Content-Type", "text/html; charset=utf-8");
      return res.status(404).send(
        "<!DOCTYPE html><html><body><p>Invalid or unknown approval link.</p></body></html>"
      );
    }
    const row = tokRes.rows[0];
    if (row.used_at) {
      res.set("Content-Type", "text/html; charset=utf-8");
      return res.status(410).send(
        "<!DOCTYPE html><html><body><p>This variation was already approved.</p></body></html>"
      );
    }
    if (new Date(row.expires_at) < new Date()) {
      res.set("Content-Type", "text/html; charset=utf-8");
      return res.status(410).send(
        "<!DOCTYPE html><html><body><p>This approval link has expired.</p></body></html>"
      );
    }

    const projectId = row.project_id;
    const ctx = await getVariationsFolderForProjectId(projectId);
    if (!ctx.ok) {
      res.set("Content-Type", "text/html; charset=utf-8");
      return res.status(500).send(`<p>${escapeHtmlPlain(ctx.message)}</p>`);
    }
    const { projectPath } = ctx;

    const projectResult = await pool.query(
      "SELECT name, client1_name, client1_email, client1_phone FROM projects WHERE id = $1",
      [projectId]
    );
    const pr = projectResult.rows[0] || {};
    const projectName = pr.name != null && String(pr.name).trim() !== "" ? String(pr.name) : `Project ${projectId}`;

    let logoBuffer = null;
    try {
      logoBuffer = await loadVariationPdfHeaderBuffer(pool);
    } catch (logoErr) {
      console.warn("Variation approve PDF: header load failed:", logoErr.message);
    }

    let items = row.items_json;
    if (typeof items === "string") {
      try {
        items = JSON.parse(items);
      } catch {
        items = [];
      }
    }
    if (!Array.isArray(items)) items = [];

    const { rows, grandTotalStr } = buildVariationRowsFromItems(items);
    const consultantName = row.consultant_name || "";
    const notifyEmail = (row.notify_email && String(row.notify_email).trim()) || "";

    const approvedDateStr = new Date().toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const pdfBuffer = await buildVariationListPdfBuffer({
      logoBuffer,
      projectName,
      clientName: pr.client1_name,
      clientEmail: pr.client1_email,
      clientPhone: pr.client1_phone,
      dateStr: approvedDateStr,
      consultantName,
      rows,
      grandTotal: grandTotalStr,
      approvalUrl: null,
      approvedStamp: true,
    });

    const outName = VARIATION_PDF_FILENAME_APPROVED;
    const outPath = path.join(projectPath, outName);
    await fs.writeFile(outPath, pdfBuffer);

    const approvalRecipients = normalizeEmailRecipients(notifyEmail);
    if (approvalRecipients.length > 0) {
      const settingsFrom = await pool.query(`SELECT smtp_user_1 FROM settings WHERE id = 1`);
      const fromAddr =
        (settingsFrom.rows[0]?.smtp_user_1 && String(settingsFrom.rows[0].smtp_user_1).trim()) ||
        process.env.SMTP_USER ||
        "info@superiorgrannyflats.com.au";
      await sendVariationApprovedPdfEmail({
        to: approvalRecipients,
        from: fromAddr,
        subject: `Variation approved — ${projectName}`,
        pdfBuffer,
        filename: outName,
      });
    }

    await pool.query(
      `UPDATE variation_approval_tokens SET used_at = NOW() WHERE token = $1 AND used_at IS NULL`,
      [token]
    );

    res.set("Content-Type", "text/html; charset=utf-8");
    res.send(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Approved</title></head><body style="font-family:system-ui,Segoe UI,sans-serif;padding:28px;max-width:520px;margin:0 auto;line-height:1.5;color:#323233;"><h1 style="color:#1b5e20;font-size:1.35rem;">Approved</h1><p>The variation PDF has been stamped <strong>APPROVED</strong> and saved in the project folder as <strong>${escapeHtmlPlain(
        VARIATION_PDF_FILENAME_APPROVED
      )}</strong>.</p>${
        approvalRecipients.length > 0
          ? `<p>A copy has been emailed to: <strong>${approvalRecipients.map((e) => escapeHtmlPlain(e)).join(", ")}</strong>.</p>`
          : "<p>No email was sent (no recipient addresses on file).</p>"
      }<p style="font-size:0.9rem;color:#666;">You can close this window.</p></body></html>`
    );
  } catch (e) {
    console.error("variation approve GET:", e);
    res.set("Content-Type", "text/html; charset=utf-8");
    res.status(500).send(
      `<!DOCTYPE html><html><body><p>Could not complete approval: ${escapeHtmlPlain(e.message)}</p></body></html>`
    );
  }
});

// Open / download a single file from the project Variations folder (path traversal safe)
app.get("/api/files/variations/:id/file", async (req, res) => {
  try {
    const relativePathRaw = req.query.relativePath;
    if (!relativePathRaw || typeof relativePathRaw !== "string") {
      return res.status(400).json({ error: "relativePath query required" });
    }

    const ctx = await getVariationsFolderForProjectId(req.params.id);
    if (!ctx.ok) {
      return res.status(ctx.status).json({ error: ctx.message });
    }
    if (!ctx.variationsFolderPath) {
      return res.status(404).json({ error: "Variations folder not found" });
    }

    const base = path.resolve(ctx.variationsFolderPath);
    const normalizedRel = relativePathRaw.replace(/\//g, path.sep);
    const target = path.resolve(base, normalizedRel);
    const rel = path.relative(base, target);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      return res.status(403).json({ error: "Invalid path" });
    }

    let st;
    try {
      st = await fs.stat(target);
    } catch {
      return res.status(404).json({ error: "File not found" });
    }
    if (!st.isFile()) {
      return res.status(400).json({ error: "Not a file" });
    }

    const basename = path.basename(target);
    const ext = path.extname(basename).toLowerCase();
    let contentType = "application/octet-stream";
    let disposition = "attachment";
    if (ext === ".xlsx") {
      contentType =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      disposition = "inline";
    } else if (ext === ".xls") {
      contentType = "application/vnd.ms-excel";
      disposition = "inline";
    } else if (ext === ".pdf") {
      contentType = "application/pdf";
      disposition = "inline";
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="${basename.replace(/"/g, "'")}"`
    );
    const buf = await fs.readFile(target);
    res.send(buf);
  } catch (error) {
    console.error("Error serving variations file:", error);
    res.status(500).json({ error: error.message });
  }
});

// List files in Variations folder
app.get("/api/files/variations/:id", async (req, res) => {
  try {
    const ctx = await getVariationsFolderForProjectId(req.params.id);
    if (!ctx.ok) {
      return res.status(ctx.status).json({ error: ctx.message });
    }

    const { variationsFolderPath, projectPath, projectYearFolder, attemptedExactPath, resolved } = ctx;

    if (!variationsFolderPath) {
      console.log(
        `Variations folder not found under project path: ${projectPath}`
      );
      return res.json({
        files: [],
        path: attemptedExactPath,
        projectPath,
        projectYearFolder,
        contractAdminFolder: resolved.contractAdminFolder,
        resolveMethod: resolved.method,
        exists: false,
        error: `Variations folder not found. Project path: ${projectPath}`,
      });
    }

    const files = await listAllFilesRecursive(variationsFolderPath);
    files.sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      files,
      path: variationsFolderPath,
      projectPath,
      projectYearFolder,
      contractAdminFolder: resolved.contractAdminFolder,
      resolveMethod: resolved.method,
      exists: true,
    });
  } catch (error) {
    console.error("Error listing variations files:", error);
    res.status(500).json({ error: error.message });
  }
});

// Serve markup PDF for a specific revision
app.get("/api/files/markup/:id/:revisionIndex", async (req, res) => {
  try {
    const { id, revisionIndex } = req.params;
    const revisionIdx = parseInt(revisionIndex, 10);
    
    if (!pool) {
      return res.status(500).json({ error: "DATABASE_URL not set" });
    }

    // Get project and drawings history
    const projectResult = await pool.query(
      "SELECT drawings_history FROM projects WHERE id = $1",
      [id]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Parse drawings history
    let drawingsHistory = [];
    try {
      const historyValue = projectResult.rows[0].drawings_history;
      if (historyValue) {
        drawingsHistory = typeof historyValue === 'string' ? JSON.parse(historyValue) : historyValue;
      }
    } catch (e) {
      console.error("Error parsing drawings_history:", e);
      return res.status(500).json({ error: "Failed to parse drawings history" });
    }

    // Check if revision index is valid
    if (revisionIdx < 0 || revisionIdx >= drawingsHistory.length) {
      return res.status(404).json({ error: "Revision not found" });
    }

    const markupPdfPath = drawingsHistory[revisionIdx]?.markup_pdf_location;

    if (!markupPdfPath) {
      return res.status(404).json({ error: "Markup PDF not found for this revision" });
    }

    // Check if file exists
    try {
      await fs.access(markupPdfPath);
    } catch (e) {
      return res.status(404).json({ error: "Markup PDF file does not exist" });
    }

    // Read and send the file
    const fileBuffer = await fs.readFile(markupPdfPath);
    const fileName = markupPdfPath.split("\\").pop() || markupPdfPath.split("/").pop() || "Markup.pdf";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.send(fileBuffer);
  } catch (error) {
    console.error("Error serving markup PDF:", error);
    res.status(500).json({ error: error.message });
  }
});

// Serve proposal PDF from `proposal_pdf_location` (set at upload / locate / register-from-folder).
app.get("/api/files/proposal/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!pool) {
      return res.status(500).json({ error: "DATABASE_URL not set" });
    }

    const projectResult = await pool.query(
      "SELECT proposal_pdf_location FROM projects WHERE id = $1",
      [id]
    );
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const rawPath = projectResult.rows[0].proposal_pdf_location;
    if (!rawPath || !String(rawPath).trim()) {
      return res.status(404).json({ error: "Proposal PDF path not set" });
    }

    const proposalPath = normalizeWindowsProjectPath(rawPath);

    try {
      await fs.access(proposalPath);
    } catch (e) {
      return res.status(404).json({ error: "Proposal PDF file does not exist" });
    }

    const fileBuffer = await fs.readFile(proposalPath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="Proposal.pdf"`);
    res.send(fileBuffer);
  } catch (e) {
    console.error("Error serving proposal PDF:", e);
    res.status(500).json({ error: e.message || "Failed to serve proposal PDF" });
  }
});

// Locate/Upload robe plan PDF (saves file and path)
app.post("/api/files/locate-robe-plan", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { projectId } = req.body;
    
    if (!projectId) {
      return res.status(400).json({ error: "Project ID is required" });
    }

    // Only accept PDF files
    if (req.file.mimetype !== "application/pdf" && !req.file.originalname.toLowerCase().endsWith(".pdf")) {
      return res.status(400).json({ error: "Only PDF files are allowed" });
    }

    // Get project details to build path
    let projectPath = null;
    if (pool) {
      const projectResult = await pool.query(
        "SELECT name, suburb, street FROM projects WHERE id = $1",
        [projectId]
      );
      
      if (projectResult.rows.length > 0) {
        const project = projectResult.rows[0];
        // Get root directory from settings
        const settingsResult = await pool.query("SELECT root_directory FROM settings WHERE id = 1");
        const rootDir = settingsResult.rows[0]?.root_directory;
        
        if (rootDir) {
          // Build project path: root_directory/street, suburb
          const projectName = project.street && project.suburb 
            ? `${project.street}, ${project.suburb}`.replace(/[<>:"/\\|?*]/g, '_')
            : project.name.replace(/[<>:"/\\|?*]/g, '_');
          projectPath = path.join(rootDir, projectName);
        }
      }
    }

    // Get the original filename
    const fileName = req.file.originalname;
    let fileLocation = fileName; // Default to just filename

    // If we have a project path, construct the expected file location
    // (Don't create folders or copy files - just store the path to where the file should be)
    if (projectPath) {
      // Construct the full file path where the robe plan should be located
      const filePath = path.join(projectPath, fileName);
      fileLocation = filePath;
      console.log(`Robe plan PDF location set to: ${filePath} (no files or folders created)`);
    }

    // Update project record with robe plan PDF location
    if (pool) {
      await pool.query(
        "UPDATE projects SET robe_plan_pdf_location = $1 WHERE id = $2",
        [fileLocation, projectId]
      );
    }

    console.log(`Robe plan PDF location saved: ${fileLocation} for project ${projectId}`);
    res.json({ 
      success: true, 
      message: "Robe plan location saved successfully",
      fileName: fileName,
      path: fileLocation
    });
  } catch (e) {
    console.error("Error saving robe plan location:", e);
    res.status(500).json({ error: e.message || "Failed to save robe plan location" });
  }
});

// Serve robe plan PDF
app.get("/api/files/robe-plan/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!pool) {
      return res.status(500).json({ error: "DATABASE_URL not set" });
    }

    // Get project and robe plan PDF location
    const projectResult = await pool.query(
      "SELECT robe_plan_pdf_location FROM projects WHERE id = $1",
      [id]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const robePlanPath = projectResult.rows[0].robe_plan_pdf_location;

    if (!robePlanPath) {
      return res.status(404).json({ error: "Robe plan PDF not found for this project" });
    }

    // Check if file exists
    try {
      await fs.access(robePlanPath);
    } catch (e) {
      return res.status(404).json({ error: "Robe plan PDF file does not exist" });
    }

    // Read and send the file
    const fileBuffer = await fs.readFile(robePlanPath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="RobePlan.pdf"`);
    res.send(fileBuffer);
  } catch (e) {
    console.error("Error serving robe plan PDF:", e);
    res.status(500).json({ error: e.message || "Failed to serve robe plan PDF" });
  }
});

// Locate/Upload robe colours PDF (saves file and path)
app.post("/api/files/locate-robe-colours", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { projectId } = req.body;
    
    if (!projectId) {
      return res.status(400).json({ error: "Project ID is required" });
    }

    // Only accept PDF files
    if (req.file.mimetype !== "application/pdf" && !req.file.originalname.toLowerCase().endsWith(".pdf")) {
      return res.status(400).json({ error: "Only PDF files are allowed" });
    }

    // Get project details to build path
    let projectPath = null;
    if (pool) {
      const projectResult = await pool.query(
        "SELECT name, suburb, street FROM projects WHERE id = $1",
        [projectId]
      );
      
      if (projectResult.rows.length > 0) {
        const project = projectResult.rows[0];
        // Get root directory from settings
        const settingsResult = await pool.query("SELECT root_directory FROM settings WHERE id = 1");
        const rootDir = settingsResult.rows[0]?.root_directory;
        
        if (rootDir) {
          // Build project path: root_directory/street, suburb
          const projectName = project.street && project.suburb 
            ? `${project.street}, ${project.suburb}`.replace(/[<>:"/\\|?*]/g, '_')
            : project.name.replace(/[<>:"/\\|?*]/g, '_');
          projectPath = path.join(rootDir, projectName);
        }
      }
    }

    // Get the original filename
    const fileName = req.file.originalname;
    let fileLocation = fileName; // Default to just filename

    // If we have a project path, construct the expected file location
    // (Don't create folders or copy files - just store the path to where the file should be)
    if (projectPath) {
      // Construct the full file path where the robe colours should be located
      const filePath = path.join(projectPath, fileName);
      fileLocation = filePath;
      console.log(`Robe colours PDF location set to: ${filePath} (no files or folders created)`);
    }

    // Update project record with robe colours PDF location
    if (pool) {
      await pool.query(
        "UPDATE projects SET robe_colours_pdf_location = $1 WHERE id = $2",
        [fileLocation, projectId]
      );
    }

    console.log(`Robe colours PDF location saved: ${fileLocation} for project ${projectId}`);
    res.json({ 
      success: true, 
      message: "Robe colours location saved successfully",
      fileName: fileName,
      path: fileLocation
    });
  } catch (e) {
    console.error("Error saving robe colours location:", e);
    res.status(500).json({ error: e.message || "Failed to save robe colours location" });
  }
});

// Serve robe colours PDF
app.get("/api/files/robe-colours/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!pool) {
      return res.status(500).json({ error: "DATABASE_URL not set" });
    }

    // Get project and robe colours PDF location
    const projectResult = await pool.query(
      "SELECT robe_colours_pdf_location FROM projects WHERE id = $1",
      [id]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const robeColoursPath = projectResult.rows[0].robe_colours_pdf_location;

    if (!robeColoursPath) {
      return res.status(404).json({ error: "Robe colours PDF not found for this project" });
    }

    // Check if file exists
    try {
      await fs.access(robeColoursPath);
    } catch (e) {
      return res.status(404).json({ error: "Robe colours PDF file does not exist" });
    }

    // Read and send the file
    const fileBuffer = await fs.readFile(robeColoursPath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="RobeColours.pdf"`);
    res.send(fileBuffer);
  } catch (e) {
    console.error("Error serving robe colours PDF:", e);
    res.status(500).json({ error: e.message || "Failed to serve robe colours PDF" });
  }
});

// Delete project
app.delete("/api/projects/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });

  const isAdmin = await isAdminRequest(req);
  if (!isAdmin) {
    return res.status(403).json({ error: "Admin access required" });
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  try {
    // Use explicit transaction in case future related deletions needed
    await pool.query('BEGIN');
    const r = await pool.query(
      "DELETE FROM projects WHERE id = $1 RETURNING *",
      [id]
    );
    if (r.rowCount === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: "not found" });
    }
    await pool.query('COMMIT');
    // Send JSON response that is not HTML, always
    res.json({ success: true, deleted: r.rows[0] });
  } catch (e) {
    try { await pool.query('ROLLBACK'); } catch {}
    res.status(500).json({ error: e.message || "Failed to delete project" });
  }
});

// ========== HOTLIST ENDPOINTS ==========
// Hotlist items are stored as projects with status "Hotlist"

// List hotlist items (projects with status "Hotlist")
app.get("/api/hotlist", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  if (!(await isSalesRequest(req))) {
    return res.status(403).json({ error: "Sales access required" });
  }
  try {
    const r = await pool.query(
      "SELECT id, name, status, suburb, street, state, stream, client_name, email, phone, agreement_sent, hotlist_notes, updated_at FROM projects WHERE status = $1 ORDER BY updated_at DESC, id DESC",
      ["Hotlist"]
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get single hotlist item
app.get("/api/hotlist/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  if (!(await isSalesRequest(req))) {
    return res.status(403).json({ error: "Sales access required" });
  }
  
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  try {
    const r = await pool.query(
      "SELECT id, name, status, suburb, street, state, stream, client_name, email, phone, agreement_sent, hotlist_notes, updated_at FROM projects WHERE id = $1 AND status = $2",
      [id, "Hotlist"]
    );
    
    if (r.rows.length === 0) {
      return res.status(404).json({ error: "not found" });
    }
    
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create hotlist item (as project with status "Hotlist")
app.post("/api/hotlist", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  if (!(await isSalesRequest(req))) {
    return res.status(403).json({ error: "Sales access required" });
  }
  try {
    const { street, suburb, state, stream, client_name, email, phone } = req.body || {};
    
    // Derive name from street + suburb (same as normal projects); Unicode dashes → ASCII like other inserts
    const projectName =
      normalizeAddressHyphensForFilesystem(`${street || ""}, ${suburb || ""}`.trim()) || "New Hotlist Item";
    
    // year = project start date (YYYY-MM-DD). When user clicks Sold, we set it to Sold date; until then use today.
    const projectDate = new Date().toISOString().split('T')[0];

    // Create initial project log entry
    const now = new Date();
    const dateTimeStr = now.toISOString().replace('T', ' ').substring(0, 19);
    const initialLogEntry = `${dateTimeStr} - Hotlist Item Created`;

    // Use same fields as normal projects - populate client1_name, client1_email, client1_phone
    const streamVal = stream != null && String(stream).trim() ? String(stream).trim() : null;

    const r = await pool.query(
      `INSERT INTO projects (name, status, suburb, street, state, stream, client_name, email, phone, year, client1_name, client1_email, client1_phone, client1_active, client2_active, client3_active, contract_status, supporting_documents_status, water_authority, water_declaration_status, planning_status, energy_report_status, footing_certification_status, building_permit_status, septic_permit, project_log, planning_jf_planning_property_report, planning_jf_title, planning_jf_covenant, planning_jf_section_173_agreement, planning_jf_plan_of_subdivision, planning_jf_ebyda_stormwater, planning_jf_byda_sewer_main, planning_jf_internal_sewer_plan, planning_jf_sewer_main_size_depth_offset, planning_jf_legal_point_discharge, planning_jf_property_info_report) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, 'Not Done', 'Not Done', 'Not Done', 'Not Done', 'Not Done', 'Not Done', 'Not Done', 'Not Done', 'Not Done', 'Not Done', 'Not Done') RETURNING id, name, status, suburb, street, state, stream, client_name, email, phone, updated_at`,
      [
        projectName,
        "Hotlist", // Status is "Hotlist"
        suburb ? normalizeAddressHyphensForFilesystem(suburb.trim()) : null,
        street ? normalizeAddressHyphensForFilesystem(street.trim()) : null,
        state ? state.trim() : null,
        streamVal,
        client_name ? client_name.trim() : null,
        email ? email.trim() : null,
        phone ? phone.trim() : null,
        projectDate,
        client_name ? client_name.trim() : null, // client1_name (same as client_name)
        email ? email.trim() : null, // client1_email (same as email)
        phone ? phone.trim() : null, // client1_phone (same as phone)
        'true',  // client1_active
        null,    // client2_active
        null,    // client3_active
        'Not Sent',  // contract_status
        'Not Sent',  // supporting_documents_status
        'Not Required',  // water_authority
        'Not Sent',  // water_declaration_status
        'Not Selected',  // planning_status
        'Not Submitted',  // energy_report_status
        'Not Submitted',  // footing_certification_status
        'Not Submitted',  // building_permit_status
        'Not Required',  // septic_permit - default for new jobs
        initialLogEntry,  // project_log
      ]
    );

    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update hotlist item
app.put("/api/hotlist/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  if (!(await isSalesRequest(req))) {
    return res.status(403).json({ error: "Sales access required" });
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  try {
    const { street, suburb, state, stream, client_name, email, phone } = req.body || {};
    
    const processValue = (val) => {
      if (val === undefined) return null;
      if (typeof val === "string") {
        const trimmed = val.trim();
        return trimmed === "" ? null : trimmed;
      }
      return val;
    };

    const streetVal = processValue(street);
    const suburbVal = processValue(suburb);
    const streetNorm =
      streetVal === null ? null : normalizeAddressHyphensForFilesystem(streetVal);
    const suburbNorm =
      suburbVal === null ? null : normalizeAddressHyphensForFilesystem(suburbVal);
    // Derive name from street + suburb
    const projectName =
      normalizeAddressHyphensForFilesystem(`${streetNorm || ""}, ${suburbNorm || ""}`.trim()) ||
      "New Hotlist Item";

    // Keep client1 fields in sync with client_name, email, phone (same as normal projects)
    const streamVal = processValue(stream);

    const r = await pool.query(
      `UPDATE projects 
       SET name = $1, street = $2, suburb = $3, state = $4, stream = $5, client_name = $6, email = $7, phone = $8, 
           client1_name = $6, client1_email = $7, client1_phone = $8, updated_at = NOW()
       WHERE id = $9 AND status = $10 RETURNING id, name, status, suburb, street, state, stream, client_name, email, phone, hotlist_notes, updated_at`,
      [
        projectName,
        streetNorm,
        suburbNorm,
        processValue(state),
        streamVal,
        processValue(client_name),
        processValue(email),
        processValue(phone),
        id,
        "Hotlist"
      ]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "not found" });
    }

    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Autosave hotlist-only notes (does not touch other project fields)
app.patch("/api/hotlist/:id/notes", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  if (!(await isSalesRequest(req))) {
    return res.status(403).json({ error: "Sales access required" });
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const raw = req.body?.hotlist_notes;
  if (typeof raw !== "string") {
    return res.status(400).json({ error: "hotlist_notes (string) required" });
  }
  const notesVal = raw;

  try {
    const r = await pool.query(
      `UPDATE projects
       SET hotlist_notes = $1, updated_at = NOW()
       WHERE id = $2 AND status = $3
       RETURNING id, hotlist_notes, updated_at`,
      [notesVal, id, "Hotlist"]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "not found" });
    }

    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete hotlist item
// Update agreement sent status for hotlist item
app.post("/api/hotlist/:id/agreement-sent", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  if (!(await isSalesRequest(req))) {
    return res.status(403).json({ error: "Sales access required" });
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  try {
    const r = await pool.query(
      `UPDATE projects 
       SET agreement_sent = 'true', updated_at = NOW()
       WHERE id = $1 AND status = $2 
       RETURNING id, name, status, suburb, street, state, stream, client_name, email, phone, agreement_sent, updated_at`,
      [id, "Hotlist"]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "not found" });
    }

    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/hotlist/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  if (!(await isSalesRequest(req))) {
    return res.status(403).json({ error: "Sales access required" });
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  try {
    const r = await pool.query(
      "DELETE FROM projects WHERE id = $1 AND status = $2 RETURNING id, name, status, suburb, street, state, client_name, email, phone, updated_at",
      [id, "Hotlist"]
    );
    if (r.rowCount === 0) {
      return res.status(404).json({ error: "not found" });
    }
    res.json({ success: true, deleted: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to delete hotlist item" });
  }
});

// Approve concept drawings (public endpoint - no auth required)
app.post("/api/projects/:id/approve-concept", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  try {
    // Get current project data
    const projectResult = await pool.query(
      "SELECT drawings_history, drawings_status, name, status, stream, suburb, street, state, deposit, project_cost, client_name, email, phone, client1_name, client1_email, client1_phone, client1_active, client2_name, client2_email, client2_phone, client2_active, client3_name, client3_email, client3_phone, client3_active, site_visit_status, site_visit_date, site_visit_time, contract_status, contract_sent_date, contract_complete_date, supporting_documents_status, supporting_documents_sent_date, supporting_documents_complete_date, water_declaration_status, water_declaration_sent_date, water_declaration_complete_date, notes, window_status, window_colour, window_reveal, window_reveal_other, window_glazing, window_bal_rating, window_date_required, window_ordered_date, window_order_pdf_location, window_order_number, drawings_pdf_location, drawings_viewed_date, drawings_sent_to_client_date, drawings_holder_date, colours_status, planning_status, energy_report_status, footing_certification_status, building_permit_status, draftsperson, survey_status, soil_status FROM projects WHERE id = $1",
      [id]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const project = projectResult.rows[0];

    // Get current drawings history
    let drawingsHistory = parseDrawingsHistory(project.drawings_history);

    if (drawingsHistory.length === 0) {
      return res.status(400).json({ error: "No drawings have been uploaded yet" });
    }

    const { history: updatedHistory, drawingsStatus: nextStatus, drawings_holder, drawings_holder_date } =
      applyConceptApprovalRules(drawingsHistory);

    // Update project with approved concept
    const updateResult = await pool.query(
      `UPDATE projects 
       SET drawings_history = $1, 
           drawings_status = $2,
           drawings_holder = $3,
           drawings_holder_date = $4,
           updated_at = NOW()
       WHERE id = $5
       RETURNING id, name, drawings_status, drawings_history, drawings_holder, drawings_holder_date`,
      [JSON.stringify(updatedHistory), nextStatus, drawings_holder, drawings_holder_date, id]
    );

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ error: "Failed to update project" });
    }

    res.json({ 
      success: true, 
      message: "Concept approved successfully",
      project: updateResult.rows[0]
    });
  } catch (e) {
    console.error("Error approving concept:", e);
    res.status(500).json({ error: e.message || "Failed to approve concept" });
  }
});

// Get all substatuses
app.get("/api/substatuses", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const result = await pool.query(
      "SELECT * FROM substatuses ORDER BY substatus, detail"
    );
    res.json(result.rows);
  } catch (e) {
    console.error("Error fetching substatuses:", e);
    res.status(500).json({ error: e.message });
  }
});

// Add a new substatus
app.post("/api/substatuses", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const { substatus, detail } = req.body;
    if (!substatus) {
      return res.status(400).json({ error: "substatus is required" });
    }
    const result = await pool.query(
      `INSERT INTO substatuses (substatus, detail)
       VALUES ($1, $2)
       ON CONFLICT (substatus, detail) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [substatus, detail || null]
    );
    res.json(result.rows[0]);
  } catch (e) {
    console.error("Error creating substatus:", e);
    res.status(500).json({ error: e.message });
  }
});

// Upgrade hotlist item to project (Sold) - changes status from "Hotlist" to "Design Phase"
app.post("/api/hotlist/:id/sold", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  if (!(await isSalesRequest(req))) {
    return res.status(403).json({ error: "Sales access required" });
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  try {
    // Get project with Hotlist status
    const projectResult = await pool.query(
      "SELECT * FROM projects WHERE id = $1 AND status = $2",
      [id, "Hotlist"]
    );
    
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "hotlist item not found" });
    }

    const project = projectResult.rows[0];
    
    // Update project log and set start date to today (Sold date) so it appears in sales for this month
    const now = new Date();
    const dateTimeStr = now.toISOString().replace('T', ' ').substring(0, 19);
    const soldDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const logEntry = project.project_log 
      ? `${project.project_log}\n${dateTimeStr} - Status changed from Hotlist to Design Phase (Sold)`
      : `${dateTimeStr} - Status changed from Hotlist to Design Phase (Sold)`;

    // Update status to "Design Phase", set start date (year) to Sold date, update log
    const updateResult = await pool.query(
      `UPDATE projects 
       SET status = $1, project_log = $2, year = $4, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      ["Design Phase", logEntry, id, soldDate]
    );

    const updatedProject = updateResult.rows[0];

    res.json({ success: true, project: updatedProject });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to upgrade hotlist item to project" });
  }
});

// Initialize OpenAI client (only if API key is set)
let openaiClient = null;
if (process.env.OPENAI_API_KEY) {
  openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  console.log("✅ OpenAI client initialized");
} else {
  console.warn("⚠️  OPENAI_API_KEY not set - AI features will be disabled");
}

/** Max longer edge (px) for the cropped elevation PNG sent to image edit — higher preserves roof lines and openings from the PDF crop. */
const AI_RENDER_ELEVATION_MAX_EDGE = 3072;

/** Margins: sky around + grass strip below—extra bottom/lateral space helps pass‑1 landscaping read less cramped. */
const AI_RENDER_PAD_LR_FRAC = 0.13;
const AI_RENDER_PAD_TOP_FRAC = 0.13;
const AI_RENDER_PAD_BOTTOM_FRAC = 0.26;
const AI_RENDER_PAD_MIN = 28;
const AI_RENDER_SKY_PAD = { r: 218, g: 234, b: 250, alpha: 255 };
const AI_RENDER_GRASS_PAD = { r: 46, g: 125, b: 72, alpha: 255 };

/**
 * Two-pass renders (see generate-render): margins first with building masked non-editable, then building
 * texture only with margins masked — OpenAI masks use alpha=0 = edit zone, alpha=255 = preserve input pixels.
 */

/** Pass 1 — editable margin only; building region stays pixel-identical. */
const AI_RENDER_PROMPT_MARGIN_PASS = `Edit ONLY pixels where this image’s PNG mask is fully transparent (outer margins only).

MARGIN PASS SCOPE:
- Keep the building region unchanged and create a photoreal environment around it.
- Use natural daylight and realistic Australian suburban landscaping, sky, shadows, driveway, and fencing.
- Aim for clean, high-quality architectural-visualization output.`;

/** Pass 2 — editable building only; margins stay unchanged. */
const AI_RENDER_PROMPT_BUILDING_PASS = `Edit ONLY pixels where this image’s PNG mask is fully transparent (building footprint only).

BUILDING PASS SCOPE:
- Create a photoreal exterior render based on this elevation and the provided finishes.
- Apply realistic materials, textures, glazing, trims, and lighting to the building.
- Preserve clear architectural lines and overall proportions from the elevation.
- Do not repaint margins outside the transparent mask.`;

/** Fallback if masked two-pass fails (API quirks): single unmasked generation—less strict pixel lock. */
const AI_RENDER_PROMPT_SINGLE_PASS_FALLBACK = `${AI_RENDER_PROMPT_MARGIN_PASS}\n\n${AI_RENDER_PROMPT_BUILDING_PASS}`;

function decodeOpenAiImageEditB64Json(imagesResp) {
  const b64 = imagesResp?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image data.");
  return Buffer.from(b64, "base64");
}

function buildAiRenderFinishInstructionsFromDb(projectRow) {
  const bits = [];
  const rc = projectRow?.roof_colour != null ? String(projectRow.roof_colour).trim() : "";
  const cc = projectRow?.cladding_colour != null ? String(projectRow.cladding_colour).trim() : "";
  const bc = projectRow?.baseboards_colour != null ? String(projectRow.baseboards_colour).trim() : "";
  if (rc) bits.push(`Roof / Colorbond: ${rc}`);
  if (cc) bits.push(`Wall cladding: ${cc}`);
  if (bc) bits.push(`Baseboards / trims: ${bc}`);
  if (bits.length === 0) {
    return "FINISHES: No roof/cladding/baseboard colours saved on this project yet—use subdued Australian exterior neutrals.";
  }
  return [
    "FINISHES (project record): apply these colours/materials to the render.",
    bits.join("\n"),
  ].join("\n");
}

async function sharpResizePngForAiInput(buffer, maxEdge = 1536) {
  const meta = await sharp(buffer).metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  if (!w || !h || (w <= maxEdge && h <= maxEdge)) {
    return buffer;
  }
  return sharp(buffer)
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
}

function elevationBreathingPaddingPx(cropW, cropH) {
  const lw = Math.max(AI_RENDER_PAD_MIN, Math.round(cropW * AI_RENDER_PAD_LR_FRAC));
  const topPad = Math.max(AI_RENDER_PAD_MIN, Math.round(cropH * AI_RENDER_PAD_TOP_FRAC));
  const bottomPad = Math.max(AI_RENDER_PAD_MIN + 8, Math.round(cropH * AI_RENDER_PAD_BOTTOM_FRAC));
  return { lw, topPad, bottomPad, cropW, cropH };
}

/** Sky margin + grass hint below elevation. Returns `{ buffer, elevationPad }` for downstream mask bbox math. */
async function padElevationPngWithBreathingRoom(buffer) {
  const meta = await sharp(buffer).metadata();
  const iw = meta.width || 0;
  const ih = meta.height || 0;
  if (!iw || !ih) {
    return { buffer, elevationPad: { lw: 0, topPad: 0, bottomPad: 0, cropW: iw || 0, cropH: ih || 0 } };
  }
  const pad = elevationBreathingPaddingPx(iw, ih);
  const { lw, topPad, bottomPad } = pad;
  const W = iw + lw + lw;
  const H = ih + topPad + bottomPad;
  const grassStrip = await sharp({
    create: { width: W, height: bottomPad, channels: 4, background: AI_RENDER_GRASS_PAD },
  })
    .png()
    .toBuffer();
  const padded = await sharp({
    create: { width: W, height: H, channels: 4, background: AI_RENDER_SKY_PAD },
  })
    .composite([
      { input: grassStrip, left: 0, top: topPad + ih },
      { input: buffer, left: lw, top: topPad },
    ])
    .png()
    .toBuffer();
  return { buffer: padded, elevationPad: pad };
}

/** gpt-image-1 edit output size → pixel dimensions. */
function parseGptImageOneEditSize(sizeStr) {
  if (sizeStr === "1536x1024") return [1536, 1024];
  if (sizeStr === "1024x1536") return [1024, 1536];
  return [1024, 1024];
}

/**
 * Picks API `size` from the **plans crop** aspect ratio (width ÷ height) only—
 * not from padded canvas—so portrait/landscape matches the elevation.
 */
function pickGptImageOneEditSizeFromPlansAspectRatio(aspectWoverH) {
  if (!Number.isFinite(aspectWoverH) || aspectWoverH <= 0) return "1024x1024";
  if (aspectWoverH < 1 / 1.05) return "1024x1536";
  if (aspectWoverH > 1.05) return "1536x1024";
  return "1024x1024";
}

function clampElevRectToTile(rect, tw, th) {
  let { left, top, width, height } = rect;
  left = Math.max(0, Math.min(Math.floor(left), tw - 1));
  top = Math.max(0, Math.min(Math.floor(top), th - 1));
  width = Math.max(1, Math.floor(width));
  height = Math.max(1, Math.floor(height));
  if (left + width > tw) width = tw - left;
  if (top + height > th) height = th - top;
  return { left, top, width, height };
}

/**
 * Uniformly scales padded image into API tile & letterboxes. Returns `{ tileBuffer, tw, th, elevInTile }`.
 */
async function fitPaddedImageToExactOpenAiEditTile(paddedBuffer, sizeStr, elevationPad) {
  const [tw, th] = parseGptImageOneEditSize(sizeStr);
  const meta = await sharp(paddedBuffer).metadata();
  const W0 = meta.width || 1;
  const H0 = meta.height || 1;
  const scale = Math.min(1, Math.min(tw / W0, th / H0));
  const W1 = Math.max(1, Math.round(W0 * scale));
  const H1 = Math.max(1, Math.round(H0 * scale));
  const resized = await sharp(paddedBuffer).resize(W1, H1).png().toBuffer();
  const slackW = tw - W1;
  const slackH = th - H1;
  const canvasLeft = Math.floor(slackW / 2);
  const canvasTop = Math.floor(slackH * 0.32);
  const grassH = th - canvasTop - H1;
  const base = sharp({
    create: { width: tw, height: th, channels: 4, background: AI_RENDER_SKY_PAD },
  });
  const composites = [];
  if (grassH > 0) {
    const grassBuf = await sharp({
      create: { width: tw, height: grassH, channels: 4, background: AI_RENDER_GRASS_PAD },
    })
      .png()
      .toBuffer();
    composites.push({ input: grassBuf, left: 0, top: canvasTop + H1 });
  }
  composites.push({ input: resized, left: canvasLeft, top: canvasTop });
  const tileBuffer = await base.composite(composites).png().toBuffer();

  const { lw, topPad, cropW, cropH } = elevationPad;
  const lx = Math.round((lw / W0) * W1);
  const ly = Math.round((topPad / H0) * H1);
  const ew = Math.round((cropW / W0) * W1);
  const eh = Math.round((cropH / H0) * H1);
  let elevInTile = {
    left: canvasLeft + lx,
    top: canvasTop + ly,
    width: ew,
    height: eh,
  };
  elevInTile = clampElevRectToTile(elevInTile, tw, th);

  return { tileBuffer, tw, th, elevInTile };
}

/** Transparent = edit margins; opaque = preserve building raster (plans crop only). */
async function buildElevationMaskPreserveBuildingEditMargins(tw, th, elev) {
  const whiteRect = await sharp({
    create: {
      width: elev.width,
      height: elev.height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 255 },
    },
  })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: tw,
      height: th,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: whiteRect, left: elev.left, top: elev.top }])
    .png()
    .toBuffer();
}

/** Transparent = texture building footprint; opaque = preserve rendered margins/skies. */
async function buildElevationMaskPreserveMarginsEditBuilding(tw, th, elev) {
  const hole = await sharp({
    create: {
      width: elev.width,
      height: elev.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: tw,
      height: th,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 255 },
    },
  })
    .composite([{ input: hole, left: elev.left, top: elev.top }])
    .png()
    .toBuffer();
}

/** POST cropped drawings elevation PNG → OpenAI image edit (high input fidelity) + DB colours → saves AI Render.png in project folder. */
app.post("/api/projects/:id/generate-render", async (req, res) => {
  if (!openaiClient) {
    return res.status(503).json({ error: "OpenAI API key not configured" });
  }
  if (!pool) {
    return res.status(500).json({ error: "DATABASE_URL not set" });
  }
  const projectId = parseInt(req.params.id, 10);
  if (!Number.isFinite(projectId)) {
    return res.status(400).json({ error: "Invalid project id" });
  }
  try {
    const projectResult = await pool.query(
      "SELECT drawings_pdf_location, colours_pdf_location, roof_colour, cladding_colour, baseboards_colour FROM projects WHERE id = $1",
      [projectId]
    );
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }
    const row = projectResult.rows[0];
    const drawingsPath = resolveStoredFilesystemPath(row.drawings_pdf_location);
    const coloursPath = resolveStoredFilesystemPath(row.colours_pdf_location);
    if (!drawingsPath) {
      return res.status(400).json({
        error: "Drawings (plan) PDF path is not set for this project. Add it on the drawings step first.",
      });
    }
    if (!coloursPath) {
      return res.status(400).json({ error: "Colours PDF path is not set for this project." });
    }
    try {
      await fs.access(drawingsPath);
    } catch {
      return res.status(400).json({ error: "Drawings PDF file was not found on disk.", path: drawingsPath });
    }
    try {
      await fs.access(coloursPath);
    } catch {
      return res.status(400).json({ error: "Colours PDF file was not found on disk.", path: coloursPath });
    }

    let planPageRaw = req.body?.planPage;
    let planPage = typeof planPageRaw === "number" ? planPageRaw : parseInt(String(planPageRaw || ""), 10);

    const pdfMod = await import(pathToFileURL(path.join(__dirname, "pdfPageToPng.mjs")).href);
    const { renderPdfPageToPngBuffer, getPdfPageCount, cropPngNormalized, AI_PLAN_RASTER_DPI } = pdfMod;

    let planPngBuf;
    let planNumPages;
    try {
      planNumPages = await getPdfPageCount(drawingsPath);
    } catch (e) {
      console.error("generate-render: could not open plan PDF:", e);
      return res.status(400).json({ error: `Could not read plan PDF for conversion: ${e.message}` });
    }
    if (planNumPages < 1) {
      return res.status(400).json({ error: "Plan PDF has no pages." });
    }
    if (!Number.isFinite(planPage) || planPage < 1 || planPage > planNumPages) {
      return res.status(400).json({
        error: "Pick a drawings page number in the elevation picker before generating.",
      });
    }

    const ec = req.body?.elevationCrop;
    if (!ec || typeof ec !== "object") {
      return res.status(400).json({
        error: "Draw a red elevation rectangle on the drawings before generating.",
      });
    }
    const nx = Number(ec.nx);
    const ny = Number(ec.ny);
    const nw = Number(ec.nw);
    const nh = Number(ec.nh);
    if (
      ![nx, ny, nw, nh].every(Number.isFinite) ||
      nx < -0.001 ||
      ny < -0.001 ||
      nw < 0.02 ||
      nh < 0.02 ||
      nx + nw > 1.001 ||
      ny + nh > 1.001
    ) {
      return res.status(400).json({
        error: "Invalid elevation crop. Redraw a rectangle covering the elevation on the plan page.",
      });
    }

    planPage = Math.min(Math.max(1, Math.floor(planPage)), planNumPages);

    try {
      planPngBuf = await renderPdfPageToPngBuffer(drawingsPath, planPage, AI_PLAN_RASTER_DPI);
      planPngBuf = await cropPngNormalized(planPngBuf, { nx, ny, nw, nh });
    } catch (e) {
      console.error("generate-render: PDF rasterize failed:", e);
      return res.status(500).json({ error: `PDF-to-image conversion failed: ${e.message}` });
    }

    const cropMeta = await sharp(planPngBuf).metadata();
    const plansAspectRatio = (cropMeta.width || 1) / (cropMeta.height || 1);

    planPngBuf = await sharpResizePngForAiInput(planPngBuf, AI_RENDER_ELEVATION_MAX_EDGE);

    const editSize = pickGptImageOneEditSizeFromPlansAspectRatio(plansAspectRatio);

    let outBuf;
    const finishBlock = buildAiRenderFinishInstructionsFromDb(row);
    const editParamsShared = {
      model: "gpt-image-1",
      quality: "high",
      input_fidelity: "high",
      size: editSize,
      n: 1,
    };

    try {
      const padded = await padElevationPngWithBreathingRoom(planPngBuf);
      const fitted = await fitPaddedImageToExactOpenAiEditTile(padded.buffer, editSize, padded.elevationPad);
      const maskMarginsBuf = await buildElevationMaskPreserveBuildingEditMargins(
        fitted.tw,
        fitted.th,
        fitted.elevInTile
      );
      const maskBuildingBuf = await buildElevationMaskPreserveMarginsEditBuilding(
        fitted.tw,
        fitted.th,
        fitted.elevInTile
      );

      const tileFile = await toFile(fitted.tileBuffer, "plan-elevation-tile.png", { type: "image/png" });
      const maskMarginFile = await toFile(maskMarginsBuf, "mask-margins.png", { type: "image/png" });

      let pass1Resp = await openaiClient.images.edit({
        ...editParamsShared,
        prompt: `${AI_RENDER_PROMPT_MARGIN_PASS}\n\n${finishBlock}`,
        image: tileFile,
        mask: maskMarginFile,
      });

      const pass1Buf = decodeOpenAiImageEditB64Json(pass1Resp);
      const pass1File = await toFile(pass1Buf, "ai-render-pass1.png", { type: "image/png" });
      const maskBuildingFile = await toFile(maskBuildingBuf, "mask-building.png", { type: "image/png" });

      let pass2Resp = await openaiClient.images.edit({
        ...editParamsShared,
        prompt: `${AI_RENDER_PROMPT_BUILDING_PASS}\n\n${finishBlock}`,
        image: pass1File,
        mask: maskBuildingFile,
      });

      outBuf = decodeOpenAiImageEditB64Json(pass2Resp);
    } catch (e) {
      console.warn(
        "generate-render: masked two-pass failed; falling back to single pass (weaker geometric lock):",
        e?.message || e
      );
      try {
        const padded = await padElevationPngWithBreathingRoom(planPngBuf);
        const fitted = await fitPaddedImageToExactOpenAiEditTile(padded.buffer, editSize, padded.elevationPad);
        const tileFile = await toFile(fitted.tileBuffer, "plan-elevation-tile.png", { type: "image/png" });
        const fbResp = await openaiClient.images.edit({
          ...editParamsShared,
          prompt: `${AI_RENDER_PROMPT_SINGLE_PASS_FALLBACK}\n\n${finishBlock}`,
          image: tileFile,
        });
        outBuf = decodeOpenAiImageEditB64Json(fbResp);
      } catch (e2) {
        console.error("generate-render OpenAI error:", e2);
        const msg = e2.message || String(e2);
        return res.status(502).json({ error: `OpenAI image generation failed: ${msg}` });
      }
    }

    const projectDir = projectDirectoryFromColoursOrDrawings(coloursPath, drawingsPath);
    if (!projectDir) {
      return res.status(500).json({ error: "Could not resolve project folder for saving the render." });
    }
    const outAbs = path.join(projectDir, AI_RENDER_FILENAME);

    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(outAbs, outBuf);

    const renderUrl = `/api/files/ai-render/${projectId}`;
    return res.json({ success: true, renderPath: outAbs, renderUrl });
  } catch (e) {
    console.error("generate-render:", e);
    return res.status(500).json({ error: e.message || "Failed to generate render" });
  }
});

// Email Generator: Analyze text and break into response points
app.post("/api/email-generator/analyze", async (req, res) => {
  if (!openaiClient) {
    return res.status(503).json({ error: "OpenAI API key not configured" });
  }

  const { text } = req.body;

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return res.status(400).json({ error: "Text is required and cannot be empty" });
  }

  try {
    const prompt = `You are assisting a construction/admin workflow. Your task is to analyze the following incoming message (which could be an email, legal text, or other written communication) and break it into clear, practical response points.

IMPORTANT GUIDELINES:
- Break the input into clear, practical response points
- Keep each point short and easy to answer (one sentence question maximum)
- Do NOT write the final reply yet - only identify what needs to be answered
- Do NOT overwhelm the user with long explanations
- One point should represent one issue, clause, request, or decision
- Use plain English
- If the input is legal or contractual, split it clause by clause where possible
- If the input is an email, identify each question or request separately
- Make questions actionable and specific

Output ONLY valid JSON in this exact format:
{
  "title": "Brief summary of the message (optional, max 50 chars)",
  "points": [
    {
      "id": 1,
      "sourceText": "Brief summary of the original clause/paragraph/request this point addresses",
      "question": "Simple, clear question for the user to answer"
    }
  ]
}

Input text to analyze:
${text.trim()}

Respond with ONLY the JSON object, no additional text or explanation.`;

    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that analyzes text and breaks it into structured response points. Always respond with valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const responseText = completion.choices[0]?.message?.content;
    
    if (!responseText) {
      console.error("OpenAI returned empty response");
      return res.status(500).json({ error: "AI returned an empty response. Please try again." });
    }
    
    let parsedResponse;

    try {
      parsedResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse OpenAI response:", responseText);
      console.error("Parse error:", parseError);
      return res.status(500).json({ 
        error: "Failed to parse AI response. The AI may have returned invalid JSON.",
        details: process.env.NODE_ENV === "development" ? responseText : undefined,
      });
    }

    // Validate response structure
    if (!parsedResponse.points || !Array.isArray(parsedResponse.points) || parsedResponse.points.length === 0) {
      return res.status(500).json({ error: "AI did not generate valid response points" });
    }

    // Ensure each point has required fields
    const validatedPoints = parsedResponse.points.map((point, index) => ({
      id: point.id || index + 1,
      sourceText: point.sourceText || `Point ${index + 1}`,
      question: point.question || "Please provide your response",
    }));

    res.json({
      title: parsedResponse.title || "Response Points",
      points: validatedPoints,
    });
  } catch (error) {
    console.error("Error in email-generator/analyze:", error);
    console.error("Error details:", {
      message: error.message,
      status: error.status,
      statusText: error.statusText,
      code: error.code,
      type: error.type,
    });
    
    // Provide more specific error messages
    let errorMessage = "Failed to analyze text";
    if (error.status === 401) {
      errorMessage = "Invalid OpenAI API key. Please check your API key configuration.";
    } else if (error.status === 429) {
      errorMessage = "OpenAI API rate limit exceeded. Please try again in a moment.";
    } else if (error.status === 500) {
      errorMessage = "OpenAI API server error. Please try again.";
    } else if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
      errorMessage = "Network error connecting to OpenAI API. Please check your internet connection.";
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({
      error: errorMessage,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// Email Generator: Compile answers into professional email draft
app.post("/api/email-generator/compile", async (req, res) => {
  if (!openaiClient) {
    return res.status(503).json({ error: "OpenAI API key not configured" });
  }

  const { points, answers, originalText } = req.body;

  if (!points || !Array.isArray(points) || points.length === 0) {
    return res.status(400).json({ error: "Points array is required" });
  }

  if (!answers || !Array.isArray(answers) || answers.length !== points.length) {
    return res.status(400).json({ error: "Answers array must match points array length" });
  }

  try {
    // Build context for the AI
    const answersContext = points
      .map((point, index) => {
        const answer = answers[index] || "";
        return `Question: ${point.question}\nYour Answer: ${answer}`;
      })
      .join("\n\n");

    const prompt = `You are drafting a professional, concise email reply for a construction/admin business.

CRITICAL RULES:
- You MUST use the EXACT answer text provided by the user - copy it directly into the email
- NEVER use placeholders like "[User's Answer]" or "[Recipient's Name]" - use the actual answer text
- If the user provided "$4,980 inc GST" or "The cost is $4,980 inc GST", you MUST include that exact text in the email
- ALL prices in the email MUST include "inc GST" after the dollar amount (e.g., "$150 inc GST", "$4,980 inc GST")
- If you mention any price or cost in the email, you MUST add "inc GST" after it
- Be professional but concise - avoid unnecessary pleasantries and fluff
- Get straight to the point - answer the question directly using the user's provided answer
- Do NOT add information the user did not provide
- Do NOT ask for more information if the user already provided a complete answer

Original message (for context):
${originalText || "Not provided"}

User's answers - USE THESE EXACT ANSWERS IN THE EMAIL:
${answersContext}

Write a concise, professional email that directly addresses each question using the user's exact answers provided above.

Output ONLY valid JSON:
{
  "subject": "Concise subject line (max 80 chars)",
  "body": "Professional, concise email using the user's exact answers (use \\n for line breaks)"
}

Respond with ONLY the JSON object, no additional text.`;

    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a professional email writing assistant. Always respond with valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.5,
    });

    const responseText = completion.choices[0]?.message?.content;
    
    if (!responseText) {
      console.error("OpenAI returned empty response");
      return res.status(500).json({ error: "AI returned an empty response. Please try again." });
    }
    
    let parsedResponse;

    try {
      parsedResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse OpenAI response:", responseText);
      console.error("Parse error:", parseError);
      return res.status(500).json({ 
        error: "Failed to parse AI response. The AI may have returned invalid JSON.",
        details: process.env.NODE_ENV === "development" ? responseText : undefined,
      });
    }

    // Validate response structure
    if (!parsedResponse.subject || !parsedResponse.body) {
      return res.status(500).json({ error: "AI did not generate valid email draft" });
    }

    // Convert \n to actual newlines for display
    const formattedBody = parsedResponse.body.replace(/\\n/g, "\n");

    res.json({
      subject: parsedResponse.subject,
      body: formattedBody,
    });
  } catch (error) {
    console.error("Error in email-generator/compile:", error);
    console.error("Error details:", {
      message: error.message,
      status: error.status,
      statusText: error.statusText,
      code: error.code,
      type: error.type,
    });
    
    // Provide more specific error messages
    let errorMessage = "Failed to compile email draft";
    if (error.status === 401) {
      errorMessage = "Invalid OpenAI API key. Please check your API key configuration.";
    } else if (error.status === 429) {
      errorMessage = "OpenAI API rate limit exceeded. Please try again in a moment.";
    } else if (error.status === 500) {
      errorMessage = "OpenAI API server error. Please try again.";
    } else if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
      errorMessage = "Network error connecting to OpenAI API. Please check your internet connection.";
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({
      error: errorMessage,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// Helper function to normalize question text for matching
function normalizeQuestion(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "") // Remove punctuation
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}

// Common stop words to filter out when matching
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by",
  "from", "up", "about", "into", "through", "during", "including", "against", "among",
  "throughout", "despite", "towards", "upon", "concerning", "to", "of", "in", "for",
  "on", "at", "by", "with", "from", "up", "about", "into", "through", "during",
  "client", "wants", "want", "would", "like", "needs", "need", "should", "could",
  "what", "how", "when", "where", "why", "which", "who", "this", "that", "these", "those"
]);

// Extract meaningful words from a normalized question (excluding stop words)
function extractMeaningfulWords(normalizedText) {
  if (!normalizedText) return [];
  return normalizedText
    .split(" ")
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

// Calculate similarity score between two sets of words
function calculateSimilarity(words1, words2) {
  if (words1.length === 0 || words2.length === 0) return 0;
  
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  
  // Count matching words
  let matches = 0;
  for (const word of set1) {
    if (set2.has(word)) {
      matches++;
    }
  }
  
  // Use Jaccard similarity: intersection / union
  const union = new Set([...set1, ...set2]);
  return matches / union.size;
}

// Email Generator: Get suggested answer for a question
app.post("/api/email-generator/suggest", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "Database not available" });
  }

  const { question } = req.body;

  if (!question || typeof question !== "string" || question.trim().length === 0) {
    return res.status(400).json({ error: "Question is required" });
  }

  try {
    const normalizedQuestion = normalizeQuestion(question);
    const questionWords = extractMeaningfulWords(normalizedQuestion);

    // Need at least 2 meaningful words to do meaningful matching
    if (questionWords.length < 2) {
      return res.json({ suggested: false });
    }

    // Search for matching learned answers
    // First try exact normalized match
    let result = await pool.query(
      `SELECT id, question_text, normalized_question, answer_text, times_used, last_used_at 
       FROM learned_answers 
       WHERE normalized_question = $1 
       ORDER BY times_used DESC, last_used_at DESC 
       LIMIT 1`,
      [normalizedQuestion]
    );

    // If no exact match, try similarity-based matching
    if (result.rows.length === 0) {
      // Get all learned answers and calculate similarity
      const allAnswers = await pool.query(
        `SELECT id, question_text, normalized_question, answer_text, times_used, last_used_at 
         FROM learned_answers 
         ORDER BY times_used DESC, last_used_at DESC`
      );

      let bestMatch = null;
      let bestScore = 0;
      const MIN_SIMILARITY = 0.3; // Require at least 30% similarity

      for (const row of allAnswers.rows) {
        const savedWords = extractMeaningfulWords(row.normalized_question);
        
        // Need at least 2 meaningful words in saved question too
        if (savedWords.length < 2) continue;

        const similarity = calculateSimilarity(questionWords, savedWords);
        
        // Also check if there's a significant word overlap (at least 2 unique words match)
        const matchingWords = questionWords.filter(w => savedWords.includes(w));
        const hasSignificantOverlap = matchingWords.length >= 2;

        // Use similarity score, but boost if there's significant word overlap
        const finalScore = hasSignificantOverlap ? Math.max(similarity, 0.4) : similarity;

        if (finalScore > bestScore && finalScore >= MIN_SIMILARITY) {
          bestScore = finalScore;
          bestMatch = row;
        }
      }

      if (bestMatch) {
        result = { rows: [bestMatch] };
      }
    }

    if (result.rows.length > 0) {
      res.json({
        suggested: true,
        answer: result.rows[0].answer_text,
        question: result.rows[0].question_text,
        timesUsed: result.rows[0].times_used,
      });
    } else {
      res.json({
        suggested: false,
      });
    }
  } catch (error) {
    console.error("Error in email-generator/suggest:", error);
    res.status(500).json({
      error: "Failed to get suggestion",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// Email Generator: Save or update learned answer
// Reset playground.html to original state
app.post("/api/playground/reset", async (req, res) => {
  try {
    const playgroundPath = path.join(__dirname, "..", "playground.html");
    
    // Original playground.html content (red triangle with "Playground" text)
    const originalHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Playground</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background: #fff;
            font-family: Arial, sans-serif;
        }
        .triangle-container {
            position: relative;
            width: 300px;
            height: 300px;
        }
        .triangle {
            width: 0;
            height: 0;
            border-left: 150px solid transparent;
            border-right: 150px solid transparent;
            border-bottom: 260px solid red;
            position: relative;
        }
        .text {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: white;
            font-size: 24px;
            font-weight: bold;
            text-align: center;
            z-index: 1;
        }
    </style>
</head>
<body>
    <div class="triangle-container">
        <div class="triangle"></div>
        <div class="text">Playground</div>
    </div>
</body>
</html>`;

    // Write the original HTML to the file
    await fs.writeFile(playgroundPath, originalHtml, "utf8");

    console.log("Playground.html reset to original state");

    res.json({
      success: true,
      message: "Playground reset successfully",
      html: originalHtml,
    });
  } catch (error) {
    console.error("Error resetting playground:", error);
    
    let errorMessage = "Failed to reset playground file";
    if (error.code === "ENOENT") {
      errorMessage = "Playground file not found";
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({
      error: errorMessage,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// Edit playground.html using AI
app.post("/api/playground/edit", async (req, res) => {
  if (!openaiClient) {
    return res.status(503).json({ error: "OpenAI API key not configured" });
  }

  const { request } = req.body;

  if (!request || !request.trim()) {
    return res.status(400).json({ error: "Request is required" });
  }

  try {
    // Read current playground.html file
    const playgroundPath = path.join(__dirname, "..", "playground.html");
    const currentHtml = await fs.readFile(playgroundPath, "utf8");

    // Send to OpenAI to modify
    const prompt = `You are a web developer assistant. The user wants to modify an HTML file.

Current HTML file:
\`\`\`html
${currentHtml}
\`\`\`

User's request: ${request}

Please modify the HTML file according to the user's request. Return ONLY the complete, valid HTML file with all necessary DOCTYPE, html, head, and body tags. Do not include any explanations or markdown formatting - just the raw HTML code.`;

    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a web developer assistant. Always return only valid HTML code without any explanations or markdown formatting.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
    });

    const modifiedHtml = completion.choices[0]?.message?.content?.trim() || "";

    if (!modifiedHtml) {
      throw new Error("No HTML content returned from AI");
    }

    // Clean up the response - remove markdown code blocks if present
    let cleanedHtml = modifiedHtml;
    if (cleanedHtml.startsWith("```html")) {
      cleanedHtml = cleanedHtml.replace(/^```html\s*/, "").replace(/\s*```$/, "");
    } else if (cleanedHtml.startsWith("```")) {
      cleanedHtml = cleanedHtml.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    // Save the modified HTML to the file
    await fs.writeFile(playgroundPath, cleanedHtml, "utf8");

    console.log("Playground.html updated successfully");

    res.json({
      success: true,
      message: "Playground updated successfully",
      html: cleanedHtml,
    });
  } catch (error) {
    console.error("Error editing playground:", error);
    
    let errorMessage = "Failed to edit playground file";
    if (error.response?.status === 401) {
      errorMessage = "Invalid OpenAI API key";
    } else if (error.response?.status === 429) {
      errorMessage = "OpenAI API rate limit exceeded. Please try again later.";
    } else if (error.code === "ENOENT") {
      errorMessage = "Playground file not found";
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({
      error: errorMessage,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

app.post("/api/email-generator/save-answer", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "Database not available" });
  }

  const { question, answer } = req.body;

  if (!question || typeof question !== "string" || question.trim().length === 0) {
    return res.status(400).json({ error: "Question is required" });
  }

  if (!answer || typeof answer !== "string" || answer.trim().length === 0) {
    return res.status(400).json({ error: "Answer is required" });
  }

  try {
    const normalizedQuestion = normalizeQuestion(question);
    const trimmedAnswer = answer.trim();

    // Check if this question already exists
    const existing = await pool.query(
      `SELECT id, times_used FROM learned_answers WHERE normalized_question = $1`,
      [normalizedQuestion]
    );

    if (existing.rows.length > 0) {
      // Update existing answer
      const existingId = existing.rows[0].id;
      const newTimesUsed = existing.rows[0].times_used + 1;
      
      await pool.query(
        `UPDATE learned_answers 
         SET answer_text = $1, 
             times_used = $2, 
             last_used_at = NOW(), 
             updated_at = NOW() 
         WHERE id = $3`,
        [trimmedAnswer, newTimesUsed, existingId]
      );

      res.json({
        success: true,
        action: "updated",
        id: existingId,
        timesUsed: newTimesUsed,
      });
    } else {
      // Insert new answer
      const result = await pool.query(
        `INSERT INTO learned_answers 
         (question_text, normalized_question, answer_text, times_used, created_at, updated_at, last_used_at) 
         VALUES ($1, $2, $3, 1, NOW(), NOW(), NOW()) 
         RETURNING id`,
        [question.trim(), normalizedQuestion, trimmedAnswer]
      );

      res.json({
        success: true,
        action: "created",
        id: result.rows[0].id,
        timesUsed: 1,
      });
    }
  } catch (error) {
    console.error("Error in email-generator/save-answer:", error);
    res.status(500).json({
      error: "Failed to save answer",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// Email Generator: Get all learned answers (for management UI)
app.get("/api/email-generator/learned-answers", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "Database not available" });
  }

  try {
    const { sort = "times_used", order = "desc", search = "" } = req.query;

    let query = `SELECT id, question_text, answer_text, category, times_used, created_at, updated_at, last_used_at 
                 FROM learned_answers`;
    const params = [];
    let paramIndex = 1;

    // Add search filter if provided
    if (search && search.trim().length > 0) {
      query += ` WHERE question_text ILIKE $${paramIndex} OR answer_text ILIKE $${paramIndex}`;
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    // Add sorting
    const validSortColumns = ["times_used", "created_at", "updated_at", "last_used_at", "question_text"];
    const sortColumn = validSortColumns.includes(sort) ? sort : "times_used";
    const sortOrder = order.toLowerCase() === "asc" ? "ASC" : "DESC";

    query += ` ORDER BY ${sortColumn} ${sortOrder}`;
    query += ` LIMIT 100`; // Limit to 100 results

    const result = await pool.query(query, params);

    res.json({
      answers: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error("Error in email-generator/learned-answers:", error);
    res.status(500).json({
      error: "Failed to get learned answers",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// Email Generator: Delete a learned answer
app.delete("/api/email-generator/learned-answers/:id", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "Database not available" });
  }

  const { id } = req.params;

  if (!id || isNaN(parseInt(id))) {
    return res.status(400).json({ error: "Valid ID is required" });
  }

  try {
    const result = await pool.query(`DELETE FROM learned_answers WHERE id = $1 RETURNING id`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Answer not found" });
    }

    res.json({ success: true, deletedId: parseInt(id) });
  } catch (error) {
    console.error("Error in email-generator/delete-learned-answer:", error);
    res.status(500).json({
      error: "Failed to delete answer",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

const http = require("http");
const { attachSecretAreaWebSocket } = require("./secretAreaRoom");

// Start server (listen immediately; migrations run in background)
(async () => {
  try {
    const httpServer = http.createServer(app);
    attachSecretAreaWebSocket(httpServer);
    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ SGF API listening on http://0.0.0.0:${PORT} (migrations running…)`);
    });
    const t0 = Date.now();
    await ensureSchema();
    console.log(`ensureSchema: ${Date.now() - t0}ms`);
    if (await shouldRunPlanningJfScrub(pool)) {
      const t1 = Date.now();
      await scrubPlanningJfPathsNotReceived(pool);
      await markPlanningJfScrubDone(pool);
      console.log(`planning JF path scrub: ${Date.now() - t1}ms`);
    }
    serverReady = true;
    console.log(`✅ Server ready (total ${Date.now() - t0}ms)`);
  } catch (e) {
    console.error("❌ Startup error:", e);
    process.exit(1);
  }
})();
