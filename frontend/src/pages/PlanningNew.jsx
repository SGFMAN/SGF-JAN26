import React, { useEffect, useState, useRef } from "react";
import { isFullFivePercentDepositPaid } from "../utils/projectDeposit";
import SiteVisit from "./SiteVisit";

const MONUMENT = "#323233";
const TILE_BLUE = "#63a7e8";
const WHITE = "#fff";
const TILE_RED = "#d9534f";
const TILE_GREEN = "#43a047";
const TILE_ORANGE = "#f0ad4e";
const SECTION_GREY = "#a1a1a3";
const SURVEY_STATUS_OPTIONS = ["Not Booked", "Booked", "Complete"];
const SOIL_STATUS_OPTIONS = ["Not Booked", "Booked", "Complete"];
const API_URL = "";

const JOB_FILE_DOC_STATUS_OPTIONS = ["Not Done", "Requested", "Received"];
const JOB_FILE_DOC_STATUS_OPTIONS_WITH_NA = ["Not Done", "Requested", "Received", "N/A"];

/** Same subfolder as on disk for property info docs (see batch rename scripts). */
const PLANNING_JF_FILE_SUBFOLDER = "7. PROPERTY INFORMATION";

/**
 * DB columns per row; h & i include N/A in dropdown.
 * pathKey = full path on disk after server upload. viewSlot = segment for /api/files/planning-jf/:id/:slot (a–k).
 */
const JOB_FILE_DOCUMENT_ROWS = [
  {
    key: "planning_jf_planning_property_report",
    pathKey: "planning_jf_planning_property_report_path",
    viewSlot: "a",
    uploadHeading: "Planning Property Report Upload",
    label: "Planning Property Report",
    allowNA: false,
  },
  {
    key: "planning_jf_title",
    pathKey: "planning_jf_title_path",
    viewSlot: "b",
    uploadHeading: "Title Upload",
    label: "Title",
    allowNA: false,
  },
  {
    key: "planning_jf_covenant",
    pathKey: "planning_jf_covenant_path",
    viewSlot: "c",
    uploadHeading: "Covenant Upload",
    label: "Covenant",
    allowNA: false,
  },
  {
    key: "planning_jf_section_173_agreement",
    pathKey: "planning_jf_section_173_agreement_path",
    viewSlot: "d",
    uploadHeading: "Section 173 Agreement Upload",
    label: "Section 173 Agreement",
    allowNA: false,
  },
  {
    key: "planning_jf_plan_of_subdivision",
    pathKey: "planning_jf_plan_of_subdivision_path",
    viewSlot: "e",
    uploadHeading: "Plan of Subdivision Upload",
    label: "Plan of Subdivision",
    allowNA: false,
  },
  {
    key: "planning_jf_ebyda_stormwater",
    pathKey: "planning_jf_ebyda_stormwater_path",
    viewSlot: "f",
    uploadHeading: "BYDA – Stormwater Upload",
    label: "BYDA – Stormwater",
    allowNA: false,
  },
  {
    key: "planning_jf_byda_sewer_main",
    pathKey: "planning_jf_byda_sewer_main_path",
    viewSlot: "g",
    uploadHeading: "BYDA – Sewer Main Upload",
    label: "BYDA – Sewer Main",
    allowNA: false,
  },
  {
    key: "planning_jf_internal_sewer_plan",
    pathKey: "planning_jf_internal_sewer_plan_path",
    viewSlot: "h",
    uploadHeading: "Internal Sewer Plan Upload",
    label: "Internal sewer plan",
    allowNA: true,
  },
  {
    key: "planning_jf_sewer_main_size_depth_offset",
    pathKey: "planning_jf_sewer_main_size_depth_offset_path",
    viewSlot: "i",
    uploadHeading: "Sewer Main Size Depth and Offset Upload",
    label: "Sewer main size depth and offset",
    allowNA: true,
  },
  {
    key: "planning_jf_legal_point_discharge",
    pathKey: "planning_jf_legal_point_discharge_path",
    viewSlot: "j",
    uploadHeading: "Legal Point of Discharge Upload",
    label: "Legal point of discharge",
    allowNA: false,
  },
  {
    key: "planning_jf_property_info_report",
    pathKey: "planning_jf_property_info_report_path",
    viewSlot: "k",
    uploadHeading: "Property Information Report Upload",
    label: "Property Information Report",
    allowNA: false,
  },
];

function jfDateKeys(statusKey) {
  return {
    requestedAt: `${statusKey}_requested_at`,
    receivedAt: `${statusKey}_received_at`,
  };
}

function todayIsoDate() {
  return new Date().toISOString().split("T")[0];
}

function formatJfDateDisplay(iso) {
  if (!iso || typeof iso !== "string") return "";
  const t = iso.trim();
  const parts = t.split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    const [y, m, d] = parts;
    return `${parseInt(d, 10)}/${parseInt(m, 10)}/${y}`;
  }
  return t;
}

function formatWrittenAdviceDateTime(iso) {
  if (!iso || typeof iso !== "string") return "";
  const t = iso.trim();
  if (!t) return "";
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const PLANNING_NA_REQUIRED_OPTIONS = ["N/A", "Required"];

const LAND_FLOODING_REG_OPTIONS = ["N/A", "REG 153", "REG 154", "REG 153 & REG 154"];
const ENERGY_SPECS_OPTIONS = ["Not Completed", "Completed"];

function landFloodingRegulationFromProject(project) {
  const t = (project?.planning_land_flooding_regulation ?? "").toString().trim();
  return LAND_FLOODING_REG_OPTIONS.includes(t) ? t : "N/A";
}

function energySpecsAddedToPlansFromProject(project) {
  const t = (project?.planning_energy_specs_added_to_plans ?? "").toString().trim();
  return ENERGY_SPECS_OPTIONS.includes(t) ? t : "Not Completed";
}

function RequestedReceivedControls({
  requestedAt,
  receivedAt,
  onRequested,
  onReceived,
  disabled,
  maxWidth = "520px",
}) {
  const buttonStyle = {
    border: "none",
    background: MONUMENT,
    color: WHITE,
    borderRadius: "8px",
    padding: "8px 16px",
    fontSize: "0.95rem",
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.65 : 1,
  };
  const textStyle = {
    fontSize: "0.82rem",
    color: "#323233cc",
    lineHeight: 1.35,
    maxWidth: "100%",
    wordBreak: "break-word",
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
        gap: "20px",
        alignItems: "start",
        maxWidth,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", textAlign: "center" }}>
        <button type="button" onClick={onRequested} disabled={disabled} style={buttonStyle}>
          Requested
        </button>
        {requestedAt ? <div style={textStyle}>{formatWrittenAdviceDateTime(requestedAt)}</div> : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", textAlign: "center" }}>
        <button type="button" onClick={onReceived} disabled={disabled} style={buttonStyle}>
          Received
        </button>
        {receivedAt ? <div style={textStyle}>{formatWrittenAdviceDateTime(receivedAt)}</div> : null}
      </div>
    </div>
  );
}

/** Resolved doc status from local draft (when set) or saved project. */
function jfRowStatusFromDraftOrProject(row, jfDocDraft, project) {
  const fromDraft = jfDocDraft?.[row.key];
  const val = fromDraft !== undefined && fromDraft !== null ? fromDraft : project?.[row.key];
  return val == null ? "" : String(val).trim();
}

/** At least one row is Received and still has a stored path (paths only live on `project`). */
function hasAnyJfReceivedWithPath(project, jfDocDraft) {
  return JOB_FILE_DOCUMENT_ROWS.some((row) => {
    const st = jfRowStatusFromDraftOrProject(row, jfDocDraft, project);
    const p = project?.[row.pathKey];
    return st === "Received" && p != null && String(p).trim() !== "";
  });
}

/**
 * After setting row `mutKey` to `nextStatus` and clearing `mutPathKey`, would any Received+path remain?
 * Uses current `project` paths for other rows (draft has no paths).
 */
function anyJfReceivedWithPathAfterRowUpdate(project, jfDocDraft, mutKey, mutPathKey, nextStatus) {
  return JOB_FILE_DOCUMENT_ROWS.some((r) => {
    const st = r.key === mutKey ? String(nextStatus).trim() : jfRowStatusFromDraftOrProject(r, jfDocDraft, project);
    const p = r.pathKey === mutPathKey ? null : project?.[r.pathKey];
    return st === "Received" && p != null && String(p).trim() !== "";
  });
}

/** Derived status for the Job File Complete tab (tracks Job File Documents + merged JOB FILE.PDF). */
function computeJobFileCompleteStatus(project, jfDocDraft) {
  const mergedPath = project?.planning_jf_job_file_pdf_path && String(project.planning_jf_job_file_pdf_path).trim();
  const hasReceivedUpload = hasAnyJfReceivedWithPath(project, jfDocDraft);

  // Stale merged PDF in DB is not "Completed" if nothing is still Received with a file
  if (mergedPath && hasReceivedUpload) return "Completed";

  const anyInProgress = JOB_FILE_DOCUMENT_ROWS.some((row) => {
    const s = jfRowStatusFromDraftOrProject(row, jfDocDraft, project);
    return s !== "" && s !== "Not Done";
  });
  if (anyInProgress) return "In Progress";
  return "Not Started";
}

function isAllowedPlanningJfUpload(file) {
  if (!file || !file.name) return false;
  const name = file.name.toLowerCase();
  if (!/\.(pdf|png|jpe?g|gif|webp|bmp|tiff?)$/i.test(name)) return false;
  const t = (file.type || "").toLowerCase();
  if (!t) return true;
  if (t === "application/pdf") return true;
  if (t.startsWith("image/")) return true;
  return false;
}

function isPdfStoredPath(fullPath) {
  return /\.pdf$/i.test(fullPath || "");
}

const PLANNING_CATEGORIES = [
  "Job File Documents",
  "Job File Complete",
  "JCA Land Survey",
  "Soil Test",
  "Drawings",
  "Site Visit",
  "Written Planning Advice",
  "Town Planning",
  "Land Subject to Flooding",
  "BAL",
  "Footing Certification",
  "Energy Report",
  "Windows",
  "Sewer PIC",
  "Septic Approval",
  "Warranty Insurance",
  "Building Permit",
  "Asset Protection",
  "Truss Computations",
  "Trade Certificates",
  "Occupancy Certificate",
  "Handover Email",
  "Asset Protection Bond Refund",
];

/** Left / right nav columns — same order as PLANNING_CATEGORIES. */
const PLANNING_NAV_COLUMN_1 = PLANNING_CATEGORIES.slice(0, 13);
const PLANNING_NAV_COLUMN_2 = PLANNING_CATEGORIES.slice(13);

/** Tab width fixed; row tracks share nav height evenly (no min that forces overflow). */
const PLANNING_TAB_CELL_W = 158;
const PLANNING_NAV_GRID_GAP = 6;
const PLANNING_NAV_GRID_ROWS = 13;
/** Bottom-left status square on each planning tab (px); grey when no status mapping. */
const PLANNING_TAB_STATUS_DOT_PX = 9;
const PLANNING_TAB_STATUS_EMPTY_GREY = "#9a9a9e";

function getDrawingTileStates(drawingsStatus) {
  const normalized = (drawingsStatus || "").toString().trim().toLowerCase();

  // "Not Asigned" is intentionally tolerated due to legacy typo in status text.
  if (
    normalized === "" ||
    normalized === "not asigned" ||
    normalized === "not assigned" ||
    normalized === "concept stage"
  ) {
    return {
      concept: { label: "Not Completed", color: TILE_RED },
      working: { label: "Not Completed", color: TILE_RED },
    };
  }

  if (normalized === "working drawing stage") {
    return {
      concept: { label: "Completed", color: TILE_GREEN },
      working: { label: "Not Completed", color: TILE_RED },
    };
  }

  if (normalized === "drawings complete") {
    return {
      concept: { label: "Completed", color: TILE_GREEN },
      working: { label: "Completed", color: TILE_GREEN },
    };
  }

  return {
    concept: { label: "Not Completed", color: TILE_RED },
    working: { label: "Not Completed", color: TILE_RED },
  };
}

function getPlanningDrawingsTileState(drawingsStatus) {
  const states = getDrawingTileStates(drawingsStatus);
  if (states.concept.label === "Completed" && states.working.label === "Completed") {
    return { label: "Completed", color: TILE_GREEN };
  }
  if (states.concept.label === "Completed") {
    return { label: "In Progress", color: TILE_ORANGE };
  }
  return { label: "Not Completed", color: TILE_RED };
}

function getSurveySoilTileState(statusValue) {
  const normalized = (statusValue || "").toString().trim().toLowerCase();
  if (normalized === "complete") {
    return { color: TILE_GREEN, label: "Complete" };
  }
  if (normalized === "booked") {
    return { color: TILE_ORANGE, label: "Booked" };
  }
  return { color: TILE_RED, label: "Not Booked" };
}

function getSiteVisitPlanningTileState(statusValue) {
  const normalized = (statusValue || "").toString().trim().toLowerCase();
  if (normalized === "complete") {
    return { color: TILE_GREEN, label: "Complete" };
  }
  if (normalized === "booked") {
    return { color: TILE_ORANGE, label: "Booked" };
  }
  if (normalized === "email sent") {
    return { color: TILE_ORANGE, label: "Email Sent" };
  }
  return { color: TILE_RED, label: "Not Complete" };
}

function getDepositStatus(depositValue, projectCostValue) {
  const isFull = isFullFivePercentDepositPaid(depositValue, projectCostValue);
  return {
    label: isFull ? "Full Deposit Paid" : "Partial Deposit Paid",
    color: isFull ? TILE_GREEN : TILE_RED,
  };
}

export default function PlanningNew({ project, onUpdate }) {
  const drawingStates = getDrawingTileStates(project?.drawings_status);
  const surveyTileState = getSurveySoilTileState(project?.survey_status);
  const soilTileState = getSurveySoilTileState(project?.soil_status);
  const depositStatus = getDepositStatus(project?.deposit, project?.project_cost);
  /** Which planning subsection is shown in the main panel (matches PLANNING_CATEGORIES labels). */
  const [planningSection, setPlanningSection] = useState(PLANNING_CATEGORIES[0]);
  const [surveyStatusDraft, setSurveyStatusDraft] = useState(project?.survey_status || "Not Booked");
  const [soilStatusDraft, setSoilStatusDraft] = useState(project?.soil_status || "Not Booked");
  const [isSaving, setIsSaving] = useState(false);
  /** Progress bar only for drag/drop path save in Received modal. */
  const [jfDropSaveProgress, setJfDropSaveProgress] = useState(0);
  const [jfDropSaveBarVisible, setJfDropSaveBarVisible] = useState(false);
  const jfDropSaveRampRef = useRef(null);
  const jfDropSaveCompleteTimerRef = useRef(null);
  const [jfMergeBusy, setJfMergeBusy] = useState(false);
  /** Row `key` when Received confirmation modal is open */
  const [jfReceivedModalRowKey, setJfReceivedModalRowKey] = useState(null);
  /** Dropdown value to restore if user cancels Received modal */
  const [jfReceivedRevert, setJfReceivedRevert] = useState(null);
  /** Shown dates right after a save until project refetch matches (avoids stale DB values). */
  const [jfBumpRequestedAt, setJfBumpRequestedAt] = useState({});
  const [jfBumpReceivedAt, setJfBumpReceivedAt] = useState({});
  /** a–k: open file viewer modal (same pattern as Drawings). */
  const [jfViewerSlot, setJfViewerSlot] = useState(null);
  /** Merged JOB FILE.PDF viewer (Job File Complete tab). */
  const [jfCombinedViewerOpen, setJfCombinedViewerOpen] = useState(false);
  const [jfReceivedDropActive, setJfReceivedDropActive] = useState(false);
  const jfReceivedFileInputRef = useRef(null);
  /** File name shown in Received modal only after a successful upload this time the modal is open. */
  const [jfReceivedSessionUploadName, setJfReceivedSessionUploadName] = useState("");

  const [jfDocDraft, setJfDocDraft] = useState(() =>
    Object.fromEntries(
      JOB_FILE_DOCUMENT_ROWS.map((row) => [row.key, "Not Done"])
    )
  );

  useEffect(() => {
    if (!project) return;
    setJfDocDraft(
      Object.fromEntries(
        JOB_FILE_DOCUMENT_ROWS.map((row) => [row.key, project[row.key] || "Not Done"])
      )
    );
  }, [project]);

  useEffect(() => {
    if (!project) return;
    setJfBumpRequestedAt((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const key of Object.keys(next)) {
        const { requestedAt } = jfDateKeys(key);
        if (String(project[requestedAt] || "").trim() === String(next[key]).trim()) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setJfBumpReceivedAt((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const key of Object.keys(next)) {
        const { receivedAt } = jfDateKeys(key);
        if (String(project[receivedAt] || "").trim() === String(next[key]).trim()) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [project]);

  useEffect(() => {
    setSurveyStatusDraft(project?.survey_status || "Not Booked");
    setSoilStatusDraft(project?.soil_status || "Not Booked");
  }, [project?.survey_status, project?.soil_status]);

  useEffect(() => {
    if (!jfReceivedModalRowKey) setJfReceivedDropActive(false);
  }, [jfReceivedModalRowKey]);

  useEffect(() => {
    setJfReceivedSessionUploadName("");
  }, [jfReceivedModalRowKey]);

  useEffect(() => {
    if (!jfViewerSlot) return;
    const row = JOB_FILE_DOCUMENT_ROWS.find((r) => r.viewSlot === jfViewerSlot);
    if (!row) {
      setJfViewerSlot(null);
      return;
    }
    if ((jfDocDraft[row.key] ?? "Not Done") !== "Received") {
      setJfViewerSlot(null);
    }
  }, [jfDocDraft, jfViewerSlot]);

  useEffect(() => {
    if (computeJobFileCompleteStatus(project, jfDocDraft) !== "Completed") {
      setJfCombinedViewerOpen(false);
    }
  }, [project, jfDocDraft]);

  useEffect(() => {
    return () => {
      if (jfDropSaveRampRef.current) clearInterval(jfDropSaveRampRef.current);
      if (jfDropSaveCompleteTimerRef.current) clearTimeout(jfDropSaveCompleteTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!jfReceivedModalRowKey) {
      setJfDropSaveBarVisible(false);
      setJfDropSaveProgress(0);
      if (jfDropSaveRampRef.current) {
        clearInterval(jfDropSaveRampRef.current);
        jfDropSaveRampRef.current = null;
      }
      if (jfDropSaveCompleteTimerRef.current) {
        clearTimeout(jfDropSaveCompleteTimerRef.current);
        jfDropSaveCompleteTimerRef.current = null;
      }
    }
  }, [jfReceivedModalRowKey]);

  function clearJfDropSaveRamp() {
    if (jfDropSaveRampRef.current) {
      clearInterval(jfDropSaveRampRef.current);
      jfDropSaveRampRef.current = null;
    }
  }

  function startJfDropSaveRamp() {
    clearJfDropSaveRamp();
    setJfDropSaveProgress(12);
    jfDropSaveRampRef.current = setInterval(() => {
      setJfDropSaveProgress((prev) => {
        if (prev >= 88) return prev;
        const delta = Math.max(0.6, (88 - prev) * 0.11);
        return Math.min(88, prev + delta);
      });
    }, 55);
  }

  function finishJfDropSaveSuccess() {
    clearJfDropSaveRamp();
    setJfDropSaveProgress(100);
    if (jfDropSaveCompleteTimerRef.current) clearTimeout(jfDropSaveCompleteTimerRef.current);
    jfDropSaveCompleteTimerRef.current = setTimeout(() => {
      jfDropSaveCompleteTimerRef.current = null;
      setIsSaving(false);
      setJfDropSaveProgress(0);
      setJfDropSaveBarVisible(false);
    }, 320);
  }

  function finishJfDropSaveError() {
    clearJfDropSaveRamp();
    if (jfDropSaveCompleteTimerRef.current) {
      clearTimeout(jfDropSaveCompleteTimerRef.current);
      jfDropSaveCompleteTimerRef.current = null;
    }
    setJfDropSaveProgress(0);
    setJfDropSaveBarVisible(false);
    setIsSaving(false);
  }

  async function saveField(fieldName, value, options = {}) {
    const { keepModalOpen = false } = options;
    if (!project?.id) return;
    setIsSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [fieldName]: value === "" ? null : value }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to save");
      }

      if (onUpdate) onUpdate();
    } catch (error) {
      console.error(`Error saving ${fieldName}:`, error);
      alert(`Error saving ${fieldName}: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function saveJobFileFields(fields, options = {}) {
    const { keepModalOpen = true, manageBusyState = true } = options;
    if (!project?.id) return false;
    const body = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      body[k] = v === "" ? null : v;
    }
    if (Object.keys(body).length === 0) return true;

    if (manageBusyState) setIsSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to save");
      }

      if (onUpdate) onUpdate();
      return true;
    } catch (error) {
      console.error("Error saving job file fields:", error);
      alert(`Error saving: ${error.message}`);
      return false;
    } finally {
      if (manageBusyState) setIsSaving(false);
    }
  }

  const writtenPlanningAdvice =
    project?.planning_written_advice != null && String(project.planning_written_advice).trim() === "Required"
      ? "Required"
      : "N/A";

  async function handleWrittenPlanningAdviceRequirementChange(e) {
    const next = e.target.value === "Required" ? "Required" : "N/A";
    if (next === "N/A") {
      await saveJobFileFields({
        planning_written_advice: "N/A",
        planning_written_advice_requested_at: null,
        planning_written_advice_received_at: null,
      });
    } else {
      await saveField("planning_written_advice", "Required");
    }
  }

  function handleWrittenPlanningAdviceStampRequested() {
    void saveField("planning_written_advice_requested_at", new Date().toISOString());
  }

  function handleWrittenPlanningAdviceStampReceived() {
    void saveField("planning_written_advice_received_at", new Date().toISOString());
  }

  const townPlanningRequirement =
    project?.planning_town_planning != null && String(project.planning_town_planning).trim() === "Required"
      ? "Required"
      : "N/A";

  async function handleTownPlanningRequirementChange(e) {
    const next = e.target.value === "Required" ? "Required" : "N/A";
    if (next === "N/A") {
      await saveJobFileFields({
        planning_town_planning: "N/A",
        planning_town_planning_requested_at: null,
        planning_town_planning_received_at: null,
      });
    } else {
      await saveField("planning_town_planning", "Required");
    }
  }

  function handleTownPlanningStampRequested() {
    void saveField("planning_town_planning_requested_at", new Date().toISOString());
  }

  function handleTownPlanningStampReceived() {
    void saveField("planning_town_planning_received_at", new Date().toISOString());
  }

  const landFloodingRegulation = landFloodingRegulationFromProject(project);

  async function handleLandFloodingRegulationChange(e) {
    const next = e.target.value;
    const safe = LAND_FLOODING_REG_OPTIONS.includes(next) ? next : "N/A";
    if (safe === "N/A") {
      await saveJobFileFields({
        planning_land_flooding_regulation: "N/A",
        planning_land_flooding_fpa_requested_at: null,
        planning_land_flooding_fpa_received_at: null,
        planning_land_flooding_cc_requested_at: null,
        planning_land_flooding_cc_received_at: null,
      });
    } else {
      await saveField("planning_land_flooding_regulation", safe);
    }
  }

  function handleLandFloodingFpaStampRequested() {
    void saveField("planning_land_flooding_fpa_requested_at", new Date().toISOString());
  }

  function handleLandFloodingFpaStampReceived() {
    void saveField("planning_land_flooding_fpa_received_at", new Date().toISOString());
  }

  function handleLandFloodingCcStampRequested() {
    void saveField("planning_land_flooding_cc_requested_at", new Date().toISOString());
  }

  function handleLandFloodingCcStampReceived() {
    void saveField("planning_land_flooding_cc_received_at", new Date().toISOString());
  }

  const balRequirement =
    project?.planning_bal != null && String(project.planning_bal).trim() === "Required" ? "Required" : "N/A";

  async function handleBalRequirementChange(e) {
    const next = e.target.value === "Required" ? "Required" : "N/A";
    if (next === "N/A") {
      await saveJobFileFields({
        planning_bal: "N/A",
        planning_bal_requested_at: null,
        planning_bal_received_at: null,
      });
    } else {
      await saveField("planning_bal", "Required");
    }
  }

  function handleBalStampRequested() {
    void saveField("planning_bal_requested_at", new Date().toISOString());
  }

  function handleBalStampReceived() {
    void saveField("planning_bal_received_at", new Date().toISOString());
  }

  function handleFootingCertificationStampRequested() {
    void saveField("planning_footing_certification_requested_at", new Date().toISOString());
  }

  function handleFootingCertificationStampReceived() {
    void saveField("planning_footing_certification_received_at", new Date().toISOString());
  }

  function handleEnergyReportStampRequested() {
    void saveField("planning_energy_report_requested_at", new Date().toISOString());
  }

  function handleEnergyReportStampReceived() {
    void saveField("planning_energy_report_received_at", new Date().toISOString());
  }

  const energySpecsAddedToPlans = energySpecsAddedToPlansFromProject(project);

  async function handleEnergySpecsAddedToPlansChange(e) {
    const next = e.target.value === "Completed" ? "Completed" : "Not Completed";
    await saveField("planning_energy_specs_added_to_plans", next);
  }

  async function savePlanningJfUploadForRow(row, file) {
    if (!file || !project?.id) return false;
    if (!isAllowedPlanningJfUpload(file)) {
      alert("Please use a PDF or image file (e.g. PNG, JPEG, GIF, WebP, TIFF).");
      return false;
    }
    setIsSaving(true);
    setJfDropSaveBarVisible(true);
    startJfDropSaveRamp();
    let ok = false;
    try {
      const form = new FormData();
      form.append("slot", row.viewSlot);
      form.append("file", file);
      const response = await fetch(`${API_URL}/api/projects/${project.id}/planning-jf-upload`, {
        method: "POST",
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || response.statusText || "Upload failed");
      }
      ok = true;
      if (onUpdate) onUpdate();
      return data.savedAs || file.name;
    } catch (e) {
      console.error(e);
      alert(e.message || "Failed to upload file");
      return false;
    } finally {
      if (ok) finishJfDropSaveSuccess();
      else finishJfDropSaveError();
    }
  }

  async function createPlanningJobFilePdf() {
    if (!project?.id) return;
    setJfMergeBusy(true);
    try {
      const response = await fetch(`${API_URL}/api/projects/${project.id}/planning-job-file-merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || response.statusText || "Failed to create JOB FILE.PDF");
      }
      if (onUpdate) onUpdate();
      alert(data.message || "JOB FILE.PDF saved.");
    } catch (err) {
      console.error(err);
      alert(err.message || "Could not create job file PDF.");
    } finally {
      setJfMergeBusy(false);
    }
  }

  function handleJfReceivedDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    setJfReceivedDropActive(true);
  }

  function handleJfReceivedDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    setJfReceivedDropActive(false);
  }

  function handleJfReceivedDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  async function handleJfReceivedDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setJfReceivedDropActive(false);
    const row = jfReceivedModalRowKey
      ? JOB_FILE_DOCUMENT_ROWS.find((r) => r.key === jfReceivedModalRowKey)
      : null;
    const file = e.dataTransfer?.files?.[0];
    if (!row || !file) return;
    const savedAs = await savePlanningJfUploadForRow(row, file);
    if (savedAs) setJfReceivedSessionUploadName(savedAs);
  }

  async function handleJfReceivedFileInputChange(e) {
    const row = jfReceivedModalRowKey
      ? JOB_FILE_DOCUMENT_ROWS.find((r) => r.key === jfReceivedModalRowKey)
      : null;
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!row || !file) return;
    const savedAs = await savePlanningJfUploadForRow(row, file);
    if (savedAs) setJfReceivedSessionUploadName(savedAs);
  }

  function handleJobFileStatusChange(row, nextStatus) {
    const { key } = row;
    const { requestedAt, receivedAt } = jfDateKeys(key);
    const opts = row.allowNA ? JOB_FILE_DOC_STATUS_OPTIONS_WITH_NA : JOB_FILE_DOC_STATUS_OPTIONS;
    const safe = opts.includes(nextStatus) ? nextStatus : "Not Done";
    const previousStatus = jfDocDraft[key] ?? "Not Done";

    if (safe === "Received") {
      setJfReceivedRevert({ key, status: previousStatus });
      setJfDocDraft((prev) => ({ ...prev, [key]: "Received" }));
      setJfReceivedModalRowKey(key);
      return;
    }

    setJfDocDraft((prev) => ({ ...prev, [key]: safe }));

    if (safe === "Requested") {
      const t = todayIsoDate();
      setJfBumpRequestedAt((b) => ({ ...b, [key]: t }));
      setJfBumpReceivedAt((b) => {
        const n = { ...b };
        delete n[key];
        return n;
      });
      void (async () => {
        const fields = {
          [key]: safe,
          [requestedAt]: t,
          [receivedAt]: null,
          [row.pathKey]: null,
        };
        if (!anyJfReceivedWithPathAfterRowUpdate(project, jfDocDraft, key, row.pathKey, safe)) {
          fields.planning_jf_job_file_pdf_path = null;
        }
        const ok = await saveJobFileFields(fields);
        if (!ok) {
          setJfBumpRequestedAt((b) => {
            const n = { ...b };
            delete n[key];
            return n;
          });
        }
      })();
      return;
    }
    setJfBumpRequestedAt((b) => {
      const n = { ...b };
      delete n[key];
      return n;
    });
    setJfBumpReceivedAt((b) => {
      const n = { ...b };
      delete n[key];
      return n;
    });
    const fields = {
      [key]: safe,
      [requestedAt]: null,
      [receivedAt]: null,
      [row.pathKey]: null,
    };
    if (!anyJfReceivedWithPathAfterRowUpdate(project, jfDocDraft, key, row.pathKey, safe)) {
      fields.planning_jf_job_file_pdf_path = null;
    }
    saveJobFileFields(fields);
  }

  function cancelReceivedModal() {
    if (jfReceivedRevert) {
      const { key, status } = jfReceivedRevert;
      setJfDocDraft((p) => ({ ...p, [key]: status }));
    }
    setJfReceivedRevert(null);
    setJfReceivedModalRowKey(null);
  }

  useEffect(() => {
    if (planningSection !== "Job File Documents") {
      setJfViewerSlot(null);
      if (jfReceivedModalRowKey) cancelReceivedModal();
    }
    if (planningSection !== "Job File Complete") {
      setJfCombinedViewerOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tab change only; avoid re-running when modal state updates on other tabs
  }, [planningSection]);

  async function confirmReceivedFromModal(rowKey) {
    const { receivedAt } = jfDateKeys(rowKey);
    const receivedDate = todayIsoDate();
    setJfBumpReceivedAt((b) => ({ ...b, [rowKey]: receivedDate }));
    const ok = await saveJobFileFields({
      [rowKey]: "Received",
      [receivedAt]: receivedDate,
    });
    if (ok) {
      setJfReceivedModalRowKey(null);
      setJfReceivedRevert(null);
    } else {
      setJfBumpReceivedAt((b) => {
        const n = { ...b };
        delete n[rowKey];
        return n;
      });
    }
  }

  const jfModalBusy = isSaving || !!jfReceivedModalRowKey;

  const jfReceivedModalRow = jfReceivedModalRowKey
    ? JOB_FILE_DOCUMENT_ROWS.find((r) => r.key === jfReceivedModalRowKey)
    : null;

  const jfViewerRow = jfViewerSlot
    ? JOB_FILE_DOCUMENT_ROWS.find((r) => r.viewSlot === jfViewerSlot) || null
    : null;
  const jfViewerPath = jfViewerRow && project ? project[jfViewerRow.pathKey] : null;
  const jfViewerStatusOk =
    jfViewerRow && (jfDocDraft[jfViewerRow.key] ?? "Not Done") === "Received";

  const jobFileCompleteStatus = computeJobFileCompleteStatus(project, jfDocDraft);

  const hasPlanningJfReceivedUpload = hasAnyJfReceivedWithPath(project, jfDocDraft);

  function renderPlanningTab(category) {
    const hint =
      category === "Job File Complete"
        ? jobFileCompleteStatus === "Completed"
          ? { label: "Completed", color: TILE_GREEN }
          : jobFileCompleteStatus === "In Progress"
            ? { label: "In Progress", color: TILE_ORANGE }
            : null
        : category === "Drawings"
        ? getPlanningDrawingsTileState(project?.drawings_status)
          : category === "JCA Land Survey"
            ? surveyTileState
            : category === "Soil Test"
              ? soilTileState
              : category === "Site Visit"
                ? getSiteVisitPlanningTileState(project?.site_visit_status)
                : null;
    const selected = planningSection === category;
    return (
      <button
        key={category}
        type="button"
        onClick={() => setPlanningSection(category)}
        style={{
          boxSizing: "border-box",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          minWidth: 0,
          minHeight: 0,
          border: "none",
          borderRadius: "6px",
          padding: "5px",
          fontSize: "0.8125rem",
          fontWeight: selected ? 600 : 500,
          lineHeight: 1.15,
          cursor: "pointer",
          background: selected ? WHITE : "rgba(255,255,255,0.22)",
          color: selected ? MONUMENT : "#2c2c30",
          boxShadow: selected ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
          outline: selected ? `2px solid ${MONUMENT}` : "none",
          overflow: "hidden",
        }}
      >
        <span
          style={{
            width: "100%",
            maxWidth: "100%",
            minWidth: 0,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            wordBreak: "break-word",
            textAlign: "center",
          }}
        >
          {category}
        </span>
        <span
          aria-hidden
          title={hint ? hint.label : undefined}
          style={{
            position: "absolute",
            left: "4px",
            bottom: "4px",
            zIndex: 1,
            pointerEvents: "none",
            width: `${PLANNING_TAB_STATUS_DOT_PX}px`,
            height: `${PLANNING_TAB_STATUS_DOT_PX}px`,
            borderRadius: "2px",
            flexShrink: 0,
            background: hint ? hint.color : PLANNING_TAB_STATUS_EMPTY_GREY,
            boxSizing: "border-box",
          }}
        />
      </button>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        width: "100%",
      }}
    >
      <h2 style={{ fontSize: "1.15rem", marginTop: 0, marginBottom: 0, color: MONUMENT, flexShrink: 0 }}>
        Planning
      </h2>

      <div
        style={{
          marginTop: "12px",
          flex: 1,
          minHeight: 0,
          display: "flex",
          gap: "20px",
          alignItems: "stretch",
        }}
      >
        <nav
          aria-label="Planning sections"
          style={{
            flexShrink: 0,
            alignSelf: "stretch",
            width: `${12 + PLANNING_TAB_CELL_W * 2 + PLANNING_NAV_GRID_GAP}px`,
            minWidth: `${12 + PLANNING_TAB_CELL_W * 2 + PLANNING_NAV_GRID_GAP}px`,
            maxWidth: `${12 + PLANNING_TAB_CELL_W * 2 + PLANNING_NAV_GRID_GAP}px`,
            minHeight: 0,
            height: "100%",
            background: SECTION_GREY,
            borderRadius: "12px",
            padding: "8px 6px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            display: "grid",
            gridTemplateColumns: `${PLANNING_TAB_CELL_W}px ${PLANNING_TAB_CELL_W}px`,
            gridTemplateRows: `repeat(${PLANNING_NAV_GRID_ROWS}, minmax(0, 1fr))`,
            gridAutoFlow: "column",
            columnGap: `${PLANNING_NAV_GRID_GAP}px`,
            rowGap: `${PLANNING_NAV_GRID_GAP}px`,
            boxSizing: "border-box",
            overflow: "hidden",
          }}
        >
          {PLANNING_NAV_COLUMN_1.map(renderPlanningTab)}
          {PLANNING_NAV_COLUMN_2.map(renderPlanningTab)}
        </nav>

        <section
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            background: WHITE,
            borderRadius: "12px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              flex: 1,
              position: "relative",
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                flex: 1,
                overflow: "auto",
                padding: "20px 22px",
              }}
            >
              {planningSection === "JCA Land Survey" && (
                <div>
                  <h3 style={{ margin: "0 0 14px 0", color: MONUMENT, fontSize: "1.1rem" }}>Site Feature Survey</h3>
                  <div style={{ marginBottom: "12px", maxWidth: "420px" }}>
                    <div
                      style={{
                        fontSize: "0.88rem",
                        fontWeight: 600,
                        color: MONUMENT,
                        marginBottom: "6px",
                      }}
                    >
                      Deposit Status
                    </div>
                    <div
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: `1px solid ${SECTION_GREY}`,
                        fontSize: "0.95rem",
                        fontWeight: 600,
                        color: depositStatus.color,
                        background: "#f8f8f8",
                        boxSizing: "border-box",
                      }}
                    >
                      {depositStatus.label}
                    </div>
                  </div>
                  <select
                    value={surveyStatusDraft}
                    onChange={(e) => setSurveyStatusDraft(e.target.value)}
                    style={{
                      width: "100%",
                      maxWidth: "420px",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: `1px solid ${SECTION_GREY}`,
                      fontSize: "1rem",
                      color: MONUMENT,
                      background: WHITE,
                      boxSizing: "border-box",
                    }}
                  >
                    {SURVEY_STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "18px", maxWidth: "420px" }}>
                    <button
                      type="button"
                      onClick={() => setSurveyStatusDraft(project?.survey_status || "Not Booked")}
                      disabled={isSaving}
                      style={{
                        border: "1px solid #c0c0c0",
                        background: WHITE,
                        color: MONUMENT,
                        borderRadius: "8px",
                        padding: "8px 14px",
                        cursor: isSaving ? "not-allowed" : "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => saveField("survey_status", surveyStatusDraft)}
                      disabled={isSaving}
                      style={{
                        border: "none",
                        background: MONUMENT,
                        color: WHITE,
                        borderRadius: "8px",
                        padding: "8px 14px",
                        cursor: isSaving ? "not-allowed" : "pointer",
                        opacity: isSaving ? 0.7 : 1,
                      }}
                    >
                      {isSaving ? "Saving..." : "OK"}
                    </button>
                  </div>
                </div>
              )}

              {planningSection === "Soil Test" && (
                <div>
                  <h3 style={{ margin: "0 0 14px 0", color: MONUMENT, fontSize: "1.1rem" }}>Soil Test</h3>
                  <div style={{ marginBottom: "12px", maxWidth: "420px" }}>
                    <div
                      style={{
                        fontSize: "0.88rem",
                        fontWeight: 600,
                        color: MONUMENT,
                        marginBottom: "6px",
                      }}
                    >
                      Deposit Status
                    </div>
                    <div
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: `1px solid ${SECTION_GREY}`,
                        fontSize: "0.95rem",
                        fontWeight: 600,
                        color: depositStatus.color,
                        background: "#f8f8f8",
                        boxSizing: "border-box",
                      }}
                    >
                      {depositStatus.label}
                    </div>
                  </div>
                  <select
                    value={soilStatusDraft}
                    onChange={(e) => setSoilStatusDraft(e.target.value)}
                    style={{
                      width: "100%",
                      maxWidth: "420px",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: `1px solid ${SECTION_GREY}`,
                      fontSize: "1rem",
                      color: MONUMENT,
                      background: WHITE,
                      boxSizing: "border-box",
                    }}
                  >
                    {SOIL_STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "18px", maxWidth: "420px" }}>
                    <button
                      type="button"
                      onClick={() => setSoilStatusDraft(project?.soil_status || "Not Booked")}
                      disabled={isSaving}
                      style={{
                        border: "1px solid #c0c0c0",
                        background: WHITE,
                        color: MONUMENT,
                        borderRadius: "8px",
                        padding: "8px 14px",
                        cursor: isSaving ? "not-allowed" : "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => saveField("soil_status", soilStatusDraft)}
                      disabled={isSaving}
                      style={{
                        border: "none",
                        background: MONUMENT,
                        color: WHITE,
                        borderRadius: "8px",
                        padding: "8px 14px",
                        cursor: isSaving ? "not-allowed" : "pointer",
                        opacity: isSaving ? 0.7 : 1,
                      }}
                    >
                      {isSaving ? "Saving..." : "OK"}
                    </button>
                  </div>
                </div>
              )}

              {planningSection === "Site Visit" && (
                <SiteVisit project={project} onUpdate={onUpdate} />
              )}

              {planningSection === "Job File Documents" && (
                <div
                  role="region"
                  aria-labelledby="jfdocs-title"
                  style={{ position: "relative" }}
                >
            <h3 id="jfdocs-title" style={{ margin: "0 0 14px 0", color: MONUMENT }}>
              Job file documents
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(0, 1.35fr) minmax(76px, 1fr) minmax(76px, 1fr) minmax(76px, 1fr) minmax(76px, 1fr)",
                  gap: "12px",
                  alignItems: "center",
                  paddingBottom: "8px",
                  borderBottom: `2px solid ${SECTION_GREY}`,
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  color: SECTION_GREY,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                <div>Document</div>
                <div style={{ textAlign: "center" }}>Status</div>
                <div style={{ textAlign: "center" }}>Requested</div>
                <div style={{ textAlign: "center" }}>Received</div>
                <div style={{ textAlign: "center" }}>View</div>
              </div>
              {JOB_FILE_DOCUMENT_ROWS.map((row) => {
                const opts = row.allowNA ? JOB_FILE_DOC_STATUS_OPTIONS_WITH_NA : JOB_FILE_DOC_STATUS_OPTIONS;
                const val = jfDocDraft[row.key] ?? "Not Done";
                const { requestedAt, receivedAt } = jfDateKeys(row.key);
                const confirmingReceivedHere = jfReceivedModalRowKey === row.key;
                const savedReq = project?.[requestedAt] && String(project[requestedAt]).trim();
                const savedRec = project?.[receivedAt] && String(project[receivedAt]).trim();
                const bumpReq = jfBumpRequestedAt[row.key];
                const bumpRec = jfBumpReceivedAt[row.key];
                const requestedIso =
                  val === "Requested"
                    ? bumpReq || savedReq || todayIsoDate()
                    : val === "Received"
                      ? savedReq || ""
                      : "";
                const receivedIso = bumpRec || savedRec || "";
                const showRequestedLine =
                  (val === "Requested" || val === "Received") && !!requestedIso;
                const showReceivedLine =
                  val === "Received" && !confirmingReceivedHere && !!receivedIso;
                const storedPath = project?.[row.pathKey] && String(project[row.pathKey]).trim();
                const showJfView = storedPath && val === "Received";
                const dateCellStyle = {
                  fontSize: "0.82rem",
                  color: MONUMENT,
                  alignSelf: "center",
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                };

                return (
                  <div
                    key={row.key}
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "minmax(0, 1.35fr) minmax(76px, 1fr) minmax(76px, 1fr) minmax(76px, 1fr) minmax(76px, 1fr)",
                      gap: "12px",
                      alignItems: "center",
                      borderBottom: `1px solid ${SECTION_GREY}`,
                      paddingBottom: "12px",
                    }}
                  >
                    <label
                      htmlFor={`jf-doc-${row.key}`}
                      style={{
                        fontSize: "0.9rem",
                        fontWeight: 600,
                        color: MONUMENT,
                        lineHeight: 1.35,
                      }}
                    >
                      {row.label}
                    </label>
                    <select
                      id={`jf-doc-${row.key}`}
                      value={opts.includes(val) ? val : "Not Done"}
                      disabled={jfModalBusy}
                      onChange={(e) => handleJobFileStatusChange(row, e.target.value)}
                      style={{
                        width: "100%",
                        minWidth: 0,
                        padding: "8px 6px",
                        borderRadius: "8px",
                        border: `1px solid ${SECTION_GREY}`,
                        fontSize: "0.85rem",
                        color: MONUMENT,
                        background: WHITE,
                        boxSizing: "border-box",
                      }}
                    >
                      {opts.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <div style={dateCellStyle}>{showRequestedLine ? formatJfDateDisplay(requestedIso) : "—"}</div>
                    <div style={dateCellStyle}>{showReceivedLine ? formatJfDateDisplay(receivedIso) : "—"}</div>
                    <div style={{ alignSelf: "center", width: "100%", minWidth: 0, display: "flex", justifyContent: "center" }}>
                      {showJfView ? (
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => setJfViewerSlot(row.viewSlot)}
                          style={{
                            border: `1px solid ${SECTION_GREY}`,
                            background: WHITE,
                            color: MONUMENT,
                            borderRadius: "8px",
                            padding: "6px 10px",
                            fontSize: "0.8rem",
                            cursor: isSaving ? "not-allowed" : "pointer",
                            width: "100%",
                            maxWidth: "100%",
                            boxSizing: "border-box",
                          }}
                        >
                          View
                        </button>
                      ) : (
                        <span style={{ fontSize: "0.8rem", color: SECTION_GREY }}>—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                flexWrap: "wrap",
                marginTop: "20px",
              }}
            >
              <button
                type="button"
                onClick={() => void createPlanningJobFilePdf()}
                disabled={isSaving || jfMergeBusy || !!jfReceivedModalRowKey || !hasPlanningJfReceivedUpload}
                title={
                  !hasPlanningJfReceivedUpload
                    ? "Mark at least one document as Received and attach a file before creating the job file PDF."
                    : undefined
                }
                style={{
                  border: "none",
                  background: !hasPlanningJfReceivedUpload ? "#d4d4d6" : MONUMENT,
                  color: !hasPlanningJfReceivedUpload ? "#8a8a8e" : WHITE,
                  borderRadius: "8px",
                  padding: "8px 14px",
                  cursor:
                    isSaving || jfMergeBusy || jfReceivedModalRowKey || !hasPlanningJfReceivedUpload
                      ? "not-allowed"
                      : "pointer",
                  opacity:
                    !hasPlanningJfReceivedUpload
                      ? 0.45
                      : isSaving || jfMergeBusy || jfReceivedModalRowKey
                        ? 0.65
                        : 1,
                }}
              >
                {jfMergeBusy ? "Creating…" : "Create Job File"}
              </button>
            </div>
                </div>
              )}

              {planningSection === "Job File Complete" && (
                <div role="region" aria-labelledby="jfcomplete-title">
                  <h3 id="jfcomplete-title" style={{ margin: "0 0 16px 0", color: MONUMENT }}>
                    Job file complete
                  </h3>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "10px",
                      flexWrap: "wrap",
                      marginBottom: "18px",
                    }}
                  >
                    <span style={{ fontSize: "0.88rem", fontWeight: 600, color: MONUMENT }}>Status</span>
                    <span
                      style={{
                        fontSize: "0.95rem",
                        fontWeight: 600,
                        color:
                          jobFileCompleteStatus === "Completed"
                            ? TILE_GREEN
                            : jobFileCompleteStatus === "In Progress"
                              ? TILE_ORANGE
                              : SECTION_GREY,
                      }}
                    >
                      {jobFileCompleteStatus === "Not Started"
                        ? "Not Started"
                        : jobFileCompleteStatus === "In Progress"
                          ? "In Progress"
                          : "Completed"}
                    </span>
                  </div>
                  <div>
                    {jobFileCompleteStatus === "Completed" && project?.id ? (
                      <button
                        type="button"
                        onClick={() => setJfCombinedViewerOpen(true)}
                        style={{
                          border: "none",
                          background: MONUMENT,
                          color: WHITE,
                          borderRadius: "8px",
                          padding: "8px 14px",
                          fontSize: "0.95rem",
                          cursor: "pointer",
                        }}
                      >
                        View Job File
                      </button>
                    ) : null}
                  </div>
                </div>
              )}

              {planningSection === "Written Planning Advice" && (
                <div role="region" aria-labelledby="written-planning-advice-title">
                  <h3 id="written-planning-advice-title" style={{ margin: "0 0 16px 0", color: MONUMENT, fontSize: "1.1rem" }}>
                    Written planning advice
                  </h3>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        writtenPlanningAdvice === "Required"
                          ? "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)"
                          : "minmax(0, 280px)",
                      gap: "20px",
                      alignItems: "start",
                      maxWidth: "760px",
                    }}
                  >
                    <div>
                      <label
                        htmlFor="written-planning-advice-select"
                        style={{
                          display: "block",
                          fontSize: "0.9rem",
                          color: "#32323399",
                          marginBottom: "6px",
                          fontWeight: 500,
                        }}
                      >
                        Requirement
                      </label>
                      <select
                        id="written-planning-advice-select"
                        value={writtenPlanningAdvice}
                        onChange={handleWrittenPlanningAdviceRequirementChange}
                        disabled={!project?.id}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "8px",
                          border: "1px solid #ddd",
                          fontSize: "1rem",
                          color: MONUMENT,
                          background: WHITE,
                          boxSizing: "border-box",
                        }}
                      >
                        {PLANNING_NA_REQUIRED_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                    {writtenPlanningAdvice === "Required" ? (
                      <>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={handleWrittenPlanningAdviceStampRequested}
                            disabled={!project?.id || isSaving}
                            style={{
                              border: "none",
                              background: MONUMENT,
                              color: WHITE,
                              borderRadius: "8px",
                              padding: "8px 16px",
                              fontSize: "0.95rem",
                              fontWeight: 500,
                              cursor: !project?.id || isSaving ? "not-allowed" : "pointer",
                              opacity: !project?.id || isSaving ? 0.65 : 1,
                            }}
                          >
                            Requested
                          </button>
                          {project?.planning_written_advice_requested_at ? (
                            <div style={{ fontSize: "0.82rem", color: "#323233cc", lineHeight: 1.35, maxWidth: "100%", wordBreak: "break-word" }}>
                              {formatWrittenAdviceDateTime(project.planning_written_advice_requested_at)}
                            </div>
                          ) : null}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={handleWrittenPlanningAdviceStampReceived}
                            disabled={!project?.id || isSaving}
                            style={{
                              border: "none",
                              background: MONUMENT,
                              color: WHITE,
                              borderRadius: "8px",
                              padding: "8px 16px",
                              fontSize: "0.95rem",
                              fontWeight: 500,
                              cursor: !project?.id || isSaving ? "not-allowed" : "pointer",
                              opacity: !project?.id || isSaving ? 0.65 : 1,
                            }}
                          >
                            Received
                          </button>
                          {project?.planning_written_advice_received_at ? (
                            <div style={{ fontSize: "0.82rem", color: "#323233cc", lineHeight: 1.35, maxWidth: "100%", wordBreak: "break-word" }}>
                              {formatWrittenAdviceDateTime(project.planning_written_advice_received_at)}
                            </div>
                          ) : null}
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              )}

              {planningSection === "Town Planning" && (
                <div role="region" aria-labelledby="town-planning-title">
                  <h3 id="town-planning-title" style={{ margin: "0 0 16px 0", color: MONUMENT, fontSize: "1.1rem" }}>
                    Town planning
                  </h3>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        townPlanningRequirement === "Required"
                          ? "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)"
                          : "minmax(0, 280px)",
                      gap: "20px",
                      alignItems: "start",
                      maxWidth: "760px",
                    }}
                  >
                    <div>
                      <label
                        htmlFor="town-planning-select"
                        style={{
                          display: "block",
                          fontSize: "0.9rem",
                          color: "#32323399",
                          marginBottom: "6px",
                          fontWeight: 500,
                        }}
                      >
                        Requirement
                      </label>
                      <select
                        id="town-planning-select"
                        value={townPlanningRequirement}
                        onChange={handleTownPlanningRequirementChange}
                        disabled={!project?.id}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "8px",
                          border: "1px solid #ddd",
                          fontSize: "1rem",
                          color: MONUMENT,
                          background: WHITE,
                          boxSizing: "border-box",
                        }}
                      >
                        {PLANNING_NA_REQUIRED_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                    {townPlanningRequirement === "Required" ? (
                      <>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={handleTownPlanningStampRequested}
                            disabled={!project?.id || isSaving}
                            style={{
                              border: "none",
                              background: MONUMENT,
                              color: WHITE,
                              borderRadius: "8px",
                              padding: "8px 16px",
                              fontSize: "0.95rem",
                              fontWeight: 500,
                              cursor: !project?.id || isSaving ? "not-allowed" : "pointer",
                              opacity: !project?.id || isSaving ? 0.65 : 1,
                            }}
                          >
                            Requested
                          </button>
                          {project?.planning_town_planning_requested_at ? (
                            <div style={{ fontSize: "0.82rem", color: "#323233cc", lineHeight: 1.35, maxWidth: "100%", wordBreak: "break-word" }}>
                              {formatWrittenAdviceDateTime(project.planning_town_planning_requested_at)}
                            </div>
                          ) : null}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={handleTownPlanningStampReceived}
                            disabled={!project?.id || isSaving}
                            style={{
                              border: "none",
                              background: MONUMENT,
                              color: WHITE,
                              borderRadius: "8px",
                              padding: "8px 16px",
                              fontSize: "0.95rem",
                              fontWeight: 500,
                              cursor: !project?.id || isSaving ? "not-allowed" : "pointer",
                              opacity: !project?.id || isSaving ? 0.65 : 1,
                            }}
                          >
                            Received
                          </button>
                          {project?.planning_town_planning_received_at ? (
                            <div style={{ fontSize: "0.82rem", color: "#323233cc", lineHeight: 1.35, maxWidth: "100%", wordBreak: "break-word" }}>
                              {formatWrittenAdviceDateTime(project.planning_town_planning_received_at)}
                            </div>
                          ) : null}
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              )}

              {planningSection === "Land Subject to Flooding" && (
                <div role="region" aria-labelledby="land-flooding-title">
                  <h3 id="land-flooding-title" style={{ margin: "0 0 16px 0", color: MONUMENT, fontSize: "1.1rem" }}>
                    Land subject to flooding
                  </h3>
                  <div style={{ maxWidth: "760px", display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={{ maxWidth: "400px" }}>
                      <label
                        htmlFor="land-flooding-reg-select"
                        style={{
                          display: "block",
                          fontSize: "0.9rem",
                          color: "#32323399",
                          marginBottom: "6px",
                          fontWeight: 500,
                        }}
                      >
                        Regulation
                      </label>
                      <select
                        id="land-flooding-reg-select"
                        value={landFloodingRegulation}
                        onChange={handleLandFloodingRegulationChange}
                        disabled={!project?.id}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "8px",
                          border: "1px solid #ddd",
                          fontSize: "1rem",
                          color: MONUMENT,
                          background: WHITE,
                          boxSizing: "border-box",
                        }}
                      >
                        {LAND_FLOODING_REG_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>

                    {landFloodingRegulation !== "N/A" ? (
                      <>
                        <div>
                          <h4
                            style={{
                              margin: "0 0 12px 0",
                              color: MONUMENT,
                              fontSize: "0.98rem",
                              fontWeight: 600,
                            }}
                          >
                            Flood Plain Authority
                          </h4>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                              gap: "20px",
                              alignItems: "start",
                              maxWidth: "520px",
                            }}
                          >
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", textAlign: "center" }}>
                              <button
                                type="button"
                                onClick={handleLandFloodingFpaStampRequested}
                                disabled={!project?.id || isSaving}
                                style={{
                                  border: "none",
                                  background: MONUMENT,
                                  color: WHITE,
                                  borderRadius: "8px",
                                  padding: "8px 16px",
                                  fontSize: "0.95rem",
                                  fontWeight: 500,
                                  cursor: !project?.id || isSaving ? "not-allowed" : "pointer",
                                  opacity: !project?.id || isSaving ? 0.65 : 1,
                                }}
                              >
                                Requested
                              </button>
                              {project?.planning_land_flooding_fpa_requested_at ? (
                                <div
                                  style={{
                                    fontSize: "0.82rem",
                                    color: "#323233cc",
                                    lineHeight: 1.35,
                                    maxWidth: "100%",
                                    wordBreak: "break-word",
                                  }}
                                >
                                  {formatWrittenAdviceDateTime(project.planning_land_flooding_fpa_requested_at)}
                                </div>
                              ) : null}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", textAlign: "center" }}>
                              <button
                                type="button"
                                onClick={handleLandFloodingFpaStampReceived}
                                disabled={!project?.id || isSaving}
                                style={{
                                  border: "none",
                                  background: MONUMENT,
                                  color: WHITE,
                                  borderRadius: "8px",
                                  padding: "8px 16px",
                                  fontSize: "0.95rem",
                                  fontWeight: 500,
                                  cursor: !project?.id || isSaving ? "not-allowed" : "pointer",
                                  opacity: !project?.id || isSaving ? 0.65 : 1,
                                }}
                              >
                                Received
                              </button>
                              {project?.planning_land_flooding_fpa_received_at ? (
                                <div
                                  style={{
                                    fontSize: "0.82rem",
                                    color: "#323233cc",
                                    lineHeight: 1.35,
                                    maxWidth: "100%",
                                    wordBreak: "break-word",
                                  }}
                                >
                                  {formatWrittenAdviceDateTime(project.planning_land_flooding_fpa_received_at)}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div>
                          <h4
                            style={{
                              margin: "0 0 12px 0",
                              color: MONUMENT,
                              fontSize: "0.98rem",
                              fontWeight: 600,
                            }}
                          >
                            Council Consent
                          </h4>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                              gap: "20px",
                              alignItems: "start",
                              maxWidth: "520px",
                            }}
                          >
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", textAlign: "center" }}>
                              <button
                                type="button"
                                onClick={handleLandFloodingCcStampRequested}
                                disabled={!project?.id || isSaving}
                                style={{
                                  border: "none",
                                  background: MONUMENT,
                                  color: WHITE,
                                  borderRadius: "8px",
                                  padding: "8px 16px",
                                  fontSize: "0.95rem",
                                  fontWeight: 500,
                                  cursor: !project?.id || isSaving ? "not-allowed" : "pointer",
                                  opacity: !project?.id || isSaving ? 0.65 : 1,
                                }}
                              >
                                Requested
                              </button>
                              {project?.planning_land_flooding_cc_requested_at ? (
                                <div
                                  style={{
                                    fontSize: "0.82rem",
                                    color: "#323233cc",
                                    lineHeight: 1.35,
                                    maxWidth: "100%",
                                    wordBreak: "break-word",
                                  }}
                                >
                                  {formatWrittenAdviceDateTime(project.planning_land_flooding_cc_requested_at)}
                                </div>
                              ) : null}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", textAlign: "center" }}>
                              <button
                                type="button"
                                onClick={handleLandFloodingCcStampReceived}
                                disabled={!project?.id || isSaving}
                                style={{
                                  border: "none",
                                  background: MONUMENT,
                                  color: WHITE,
                                  borderRadius: "8px",
                                  padding: "8px 16px",
                                  fontSize: "0.95rem",
                                  fontWeight: 500,
                                  cursor: !project?.id || isSaving ? "not-allowed" : "pointer",
                                  opacity: !project?.id || isSaving ? 0.65 : 1,
                                }}
                              >
                                Received
                              </button>
                              {project?.planning_land_flooding_cc_received_at ? (
                                <div
                                  style={{
                                    fontSize: "0.82rem",
                                    color: "#323233cc",
                                    lineHeight: 1.35,
                                    maxWidth: "100%",
                                    wordBreak: "break-word",
                                  }}
                                >
                                  {formatWrittenAdviceDateTime(project.planning_land_flooding_cc_received_at)}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              )}

              {planningSection === "Drawings" && (
                <div role="region" aria-labelledby="planning-drawings-title">
                  <h3 id="planning-drawings-title" style={{ margin: "0 0 16px 0", color: MONUMENT, fontSize: "1.1rem" }}>
                    Drawings
                  </h3>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                      gap: "20px",
                      maxWidth: "760px",
                    }}
                  >
                    <div
                      style={{
                        border: `1px solid ${SECTION_GREY}`,
                        borderRadius: "12px",
                        padding: "16px",
                        background: "rgba(67, 160, 71, 0.06)",
                      }}
                    >
                      <div style={{ fontSize: "0.95rem", fontWeight: 600, color: MONUMENT, marginBottom: "8px" }}>
                        Concept Drawings
                      </div>
                      <div style={{ fontSize: "0.9rem", color: SECTION_GREY, lineHeight: 1.5 }}>
                        Status comes from the Drawings page.
                      </div>
                      <div style={{ marginTop: "10px", fontSize: "0.98rem", fontWeight: 600, color: drawingStates.concept.color }}>
                        {drawingStates.concept.label}
                      </div>
                    </div>

                    <div
                      style={{
                        border: `1px solid ${SECTION_GREY}`,
                        borderRadius: "12px",
                        padding: "16px",
                        background: "rgba(99, 167, 232, 0.08)",
                      }}
                    >
                      <div style={{ fontSize: "0.95rem", fontWeight: 600, color: MONUMENT, marginBottom: "8px" }}>
                        Working Drawings
                      </div>
                      <div style={{ fontSize: "0.9rem", color: SECTION_GREY, lineHeight: 1.5 }}>
                        Status comes from the Drawings page.
                      </div>
                      <div style={{ marginTop: "10px", fontSize: "0.98rem", fontWeight: 600, color: drawingStates.working.color }}>
                        {drawingStates.working.label}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {planningSection === "BAL" && (
                <div role="region" aria-labelledby="bal-title">
                  <h3 id="bal-title" style={{ margin: "0 0 16px 0", color: MONUMENT, fontSize: "1.1rem" }}>
                    BAL
                  </h3>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: balRequirement === "Required" ? "minmax(0, 280px) minmax(0, 1fr)" : "minmax(0, 280px)",
                      gap: "20px",
                      alignItems: "start",
                      maxWidth: "760px",
                    }}
                  >
                    <div>
                      <label
                        htmlFor="bal-select"
                        style={{
                          display: "block",
                          fontSize: "0.9rem",
                          color: "#32323399",
                          marginBottom: "6px",
                          fontWeight: 500,
                        }}
                      >
                        Requirement
                      </label>
                      <select
                        id="bal-select"
                        value={balRequirement}
                        onChange={handleBalRequirementChange}
                        disabled={!project?.id}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "8px",
                          border: "1px solid #ddd",
                          fontSize: "1rem",
                          color: MONUMENT,
                          background: WHITE,
                          boxSizing: "border-box",
                        }}
                      >
                        {PLANNING_NA_REQUIRED_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                    {balRequirement === "Required" ? (
                      <RequestedReceivedControls
                        requestedAt={project?.planning_bal_requested_at}
                        receivedAt={project?.planning_bal_received_at}
                        onRequested={handleBalStampRequested}
                        onReceived={handleBalStampReceived}
                        disabled={!project?.id || isSaving}
                      />
                    ) : null}
                  </div>
                </div>
              )}

              {planningSection === "Footing Certification" && (
                <div role="region" aria-labelledby="footing-certification-title">
                  <h3 id="footing-certification-title" style={{ margin: "0 0 16px 0", color: MONUMENT, fontSize: "1.1rem" }}>
                    Footing certification
                  </h3>
                  <RequestedReceivedControls
                    requestedAt={project?.planning_footing_certification_requested_at}
                    receivedAt={project?.planning_footing_certification_received_at}
                    onRequested={handleFootingCertificationStampRequested}
                    onReceived={handleFootingCertificationStampReceived}
                    disabled={!project?.id || isSaving}
                  />
                </div>
              )}

              {planningSection === "Energy Report" && (
                <div role="region" aria-labelledby="energy-report-title">
                  <h3 id="energy-report-title" style={{ margin: "0 0 16px 0", color: MONUMENT, fontSize: "1.1rem" }}>
                    Energy report
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "760px" }}>
                    <div>
                      <RequestedReceivedControls
                        requestedAt={project?.planning_energy_report_requested_at}
                        receivedAt={project?.planning_energy_report_received_at}
                        onRequested={handleEnergyReportStampRequested}
                        onReceived={handleEnergyReportStampReceived}
                        disabled={!project?.id || isSaving}
                      />
                    </div>

                    <div style={{ maxWidth: "320px" }}>
                      <label
                        htmlFor="energy-specs-added-select"
                        style={{
                          display: "block",
                          fontSize: "0.9rem",
                          color: "#32323399",
                          marginBottom: "6px",
                          fontWeight: 500,
                        }}
                      >
                        Energy Specs Added to Plans
                      </label>
                      <select
                        id="energy-specs-added-select"
                        value={energySpecsAddedToPlans}
                        onChange={handleEnergySpecsAddedToPlansChange}
                        disabled={!project?.id || isSaving}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "8px",
                          border: "1px solid #ddd",
                          fontSize: "1rem",
                          color: MONUMENT,
                          background: WHITE,
                          boxSizing: "border-box",
                        }}
                      >
                        {ENERGY_SPECS_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {planningSection !== "JCA Land Survey" &&
                planningSection !== "Soil Test" &&
                planningSection !== "Site Visit" &&
                planningSection !== "Job File Documents" &&
                planningSection !== "Job File Complete" &&
                planningSection !== "Drawings" &&
                planningSection !== "Written Planning Advice" &&
                planningSection !== "Town Planning" &&
                planningSection !== "Land Subject to Flooding" &&
                planningSection !== "BAL" &&
                planningSection !== "Footing Certification" &&
                planningSection !== "Energy Report" && (
                  <div>
                    <h3 style={{ margin: "0 0 10px 0", color: MONUMENT, fontSize: "1.1rem" }}>{planningSection}</h3>
                    <p style={{ margin: 0, fontSize: "0.9rem", color: SECTION_GREY, lineHeight: 1.5, maxWidth: "640px" }}>
                      <>Use other project sections to update this item when applicable. No extra controls are on this tab yet.</>
                    </p>
                  </div>
                )}
            </div>

      {planningSection === "Job File Documents" && jfReceivedModalRowKey && jfReceivedModalRow ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 4,
            padding: "16px",
            borderRadius: "12px",
          }}
        >
          <div
            style={{
              position: "relative",
              background: WHITE,
              borderRadius: "12px",
              width: "min(520px, 100%)",
              maxWidth: "92vw",
              padding: "22px",
              paddingBottom: jfDropSaveBarVisible ? "100px" : "22px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="jf-received-title"
          >
            <h3 id="jf-received-title" style={{ margin: "0 0 10px 0", color: MONUMENT, fontSize: "1.05rem" }}>
              {jfReceivedModalRow.uploadHeading}
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "0.88rem", color: SECTION_GREY, lineHeight: 1.45 }}>
              Confirm to save status <strong>Received</strong> and today&apos;s date. Drop or choose a PDF or image
              below to copy it into <strong>{PLANNING_JF_FILE_SUBFOLDER}</strong> with the standard name for this
              section (replacing any previous file for that section).
            </p>
            <div
              onDragEnter={handleJfReceivedDragEnter}
              onDragOver={handleJfReceivedDragOver}
              onDragLeave={handleJfReceivedDragLeave}
              onDrop={handleJfReceivedDrop}
              onClick={() => {
                if (!isSaving) jfReceivedFileInputRef.current?.click();
              }}
              style={{
                border: `2px dashed ${jfReceivedDropActive ? TILE_BLUE : SECTION_GREY}`,
                borderRadius: "10px",
                padding: "28px 16px",
                textAlign: "center",
                cursor: isSaving ? "not-allowed" : "pointer",
                background: jfReceivedDropActive ? "rgba(99, 167, 232, 0.08)" : "#fafafa",
                marginBottom: "14px",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <div style={{ fontSize: "0.9rem", fontWeight: 600, color: MONUMENT, marginBottom: "6px" }}>
                Drag and drop file here
              </div>
              <div style={{ fontSize: "0.82rem", color: SECTION_GREY }}>or click to browse (PDF, PNG, JPEG, …)</div>
              <input
                ref={jfReceivedFileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.bmp,.tif,.tiff,application/pdf,image/*"
                onChange={handleJfReceivedFileInputChange}
                style={{ display: "none" }}
              />
            </div>
            {jfReceivedSessionUploadName ? (
              <div style={{ marginBottom: "16px" }}>
                <span
                  style={{
                    fontSize: "0.88rem",
                    color: MONUMENT,
                    wordBreak: "break-all",
                    lineHeight: 1.35,
                  }}
                  title={jfReceivedSessionUploadName}
                >
                  {jfReceivedSessionUploadName}
                </span>
              </div>
            ) : null}
            {jfDropSaveBarVisible ? (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: "72px",
                  padding: "12px 22px",
                  background: "rgba(255,255,255,0.98)",
                  borderTop: `1px solid ${SECTION_GREY}`,
                  boxShadow: "0 -4px 12px rgba(0,0,0,0.06)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: MONUMENT,
                      fontWeight: 700,
                      minWidth: "36px",
                      textAlign: "right",
                    }}
                  >
                    {Math.round(jfDropSaveProgress)}%
                  </span>
                  <div
                    style={{
                      flex: 1,
                      height: "10px",
                      borderRadius: "5px",
                      background: "#e4e4e6",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${jfDropSaveProgress}%`,
                        height: "100%",
                        borderRadius: "5px",
                        background: TILE_BLUE,
                        transition: "width 0.1s linear",
                      }}
                    />
                  </div>
                  <span style={{ fontSize: "0.7rem", color: SECTION_GREY, fontWeight: 600 }}>Saving…</span>
                </div>
              </div>
            ) : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                onClick={cancelReceivedModal}
                disabled={isSaving}
                style={{
                  border: "1px solid #c0c0c0",
                  background: WHITE,
                  color: MONUMENT,
                  borderRadius: "8px",
                  padding: "8px 14px",
                  cursor: isSaving ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirmReceivedFromModal(jfReceivedModalRowKey)}
                disabled={isSaving}
                style={{
                  border: "none",
                  background: MONUMENT,
                  color: WHITE,
                  borderRadius: "8px",
                  padding: "8px 14px",
                  cursor: isSaving ? "not-allowed" : "pointer",
                  opacity: isSaving ? 0.75 : 1,
                }}
              >
                {isSaving ? "Saving…" : "OK"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {planningSection === "Job File Documents" && jfViewerSlot && project?.id && jfViewerPath && jfViewerStatusOk ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 5,
            padding: "16px",
            borderRadius: "12px",
          }}
          onClick={() => setJfViewerSlot(null)}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "24px",
              width: "90%",
              maxWidth: "1200px",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="jf-viewer-title"
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
                flexShrink: 0,
              }}
            >
              <h2 id="jf-viewer-title" style={{ margin: 0, fontSize: "1.35rem", color: MONUMENT }}>
                {jfViewerRow?.label || "Document"}
              </h2>
              <button
                type="button"
                onClick={() => setJfViewerSlot(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                  color: MONUMENT,
                  padding: "0",
                  width: "30px",
                  height: "30px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              {isPdfStoredPath(jfViewerPath) ? (
                <iframe
                  src={`${API_URL}/api/files/planning-jf/${project.id}/${jfViewerSlot}?t=${Date.now()}`}
                  style={{
                    width: "100%",
                    flex: 1,
                    border: "none",
                    borderRadius: "8px",
                    minHeight: "min(600px, 70vh)",
                  }}
                  title={jfViewerRow?.label || "Document preview"}
                />
              ) : (
                <div
                  style={{
                    flex: 1,
                    minHeight: "min(600px, 70vh)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "auto",
                    borderRadius: "8px",
                    background: "#f5f5f5",
                  }}
                >
                  <img
                    src={`${API_URL}/api/files/planning-jf/${project.id}/${jfViewerSlot}?t=${Date.now()}`}
                    alt=""
                    style={{
                      maxWidth: "100%",
                      maxHeight: "min(72vh, 720px)",
                      objectFit: "contain",
                      borderRadius: "6px",
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {planningSection === "Job File Complete" && jfCombinedViewerOpen && project?.id ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 6,
            padding: "16px",
            borderRadius: "12px",
          }}
          onClick={() => setJfCombinedViewerOpen(false)}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "24px",
              width: "90%",
              maxWidth: "1200px",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="jf-combined-viewer-title"
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
                flexShrink: 0,
              }}
            >
              <h2 id="jf-combined-viewer-title" style={{ margin: 0, fontSize: "1.35rem", color: MONUMENT }}>
                JOB FILE.PDF
              </h2>
              <button
                type="button"
                onClick={() => setJfCombinedViewerOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                  color: MONUMENT,
                  padding: "0",
                  width: "30px",
                  height: "30px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <iframe
              src={`${API_URL}/api/files/planning-jf/${project.id}/combined?t=${Date.now()}`}
              style={{
                width: "100%",
                flex: 1,
                border: "none",
                borderRadius: "8px",
                minHeight: "min(600px, 70vh)",
              }}
              title="JOB FILE.PDF preview"
            />
          </div>
        </div>
      ) : null}

          </div>
        </section>
      </div>

    </div>
  );
}
