import React, { useState, useEffect, useCallback, useRef } from "react";
import { parseEmailGeneralJson } from "../utils/emailGeneralSettings";
const MONUMENT = "#323233";
const WHITE = "#fff";
const NEW_PROJECT_SECTION_BLUE = {
  backgroundColor: "#e8f2fc",
  border: "1px solid #4d93d9",
  borderRadius: "10px",
  padding: "12px 14px 14px",
  boxSizing: "border-box",
};
const API_URL = "";

/** Non-empty `smtp_user_1`…`smtp_user_16` from settings (deduped, sorted). */
function smtpSlotEmailsFromSettings(data) {
  if (!data || typeof data !== "object") return [];
  const seen = new Set();
  const list = [];
  for (let i = 1; i <= 16; i++) {
    const raw = data[`smtp_user_${i}`];
    const e = raw == null ? "" : String(raw).trim();
    if (!e) continue;
    const key = e.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(e);
  }
  list.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return list;
}

const STREAM_OPTIONS = [
  "SGF - VIC",
  "SGF - QLD",
  "Dual Dwelling - VIC",
  "Dual Dwelling - QLD",
  "ATA - VIC",
  "ATA - QLD",
  "Pumped On Property - VIC",
  "Pumped On Property - QLD",
  "Henderson - VIC",
  "Henderson - QLD",
  "Create Cash Flow - VIC",
  "Create Cash Flow - QLD",
  "Fresh Start Advisory - VIC",
  "Fresh Start Advisory - QLD",
];

const STREAM_DISPLAY_ORDER = [
  "SGF - Retail",
  "Dual Dwelling Investments",
  "ATA",
  "Pumped On Property",
  "Henderson",
  "Create Cash Flow",
  "Fresh Start Advisory",
];

const LEGACY_STREAM_TO_VIC = {
  "Dual Dwelling": "Dual Dwelling - VIC",
  ATA: "ATA - VIC",
  "Pumped On Property": "Pumped On Property - VIC",
  "Pumped on Property": "Pumped On Property - VIC",
  Henderson: "Henderson - VIC",
  "Create Cash Flow": "Create Cash Flow - VIC",
  "Creat Cash Flow": "Create Cash Flow - VIC",
  "Fresh Start Advisory": "Fresh Start Advisory - VIC",
};

const EXTRA_EMAIL_SLOTS = [
  { checkKey: "extraEmail1", addrKey: "extraEmail1Address", label: "Extra Email 1" },
  { checkKey: "extraEmail2", addrKey: "extraEmail2Address", label: "Extra Email 2" },
  { checkKey: "extraEmail3", addrKey: "extraEmail3Address", label: "Extra Email 3" },
];

/** Send-client style sections: extra rows with optional prefix (`""` = legacy `extraEmail1` keys). */
function drawingsSendClientExtraSlotDefs(prefix) {
  if (!prefix) return EXTRA_EMAIL_SLOTS;
  return [1, 2, 3].map((n) => ({
    checkKey: `${prefix}ExtraEmail${n}`,
    addrKey: `${prefix}ExtraEmail${n}Address`,
    label: `Extra Email ${n}`,
  }));
}

/** QLD `drawings` key from camelCase base key (e.g. `extraEmail1` → `qldExtraEmail1`). */
function qldDrawingsKey(baseKey) {
  return `qld${baseKey.charAt(0).toUpperCase()}${baseKey.slice(1)}`;
}

/** When Sales Notes From/To are empty, copy from Design Notes with From/To reversed (one-way seed). */
function seedSalesNotesFromDesignNotesReversed(d) {
  const T = (v) => (v == null ? "" : String(v).trim());
  if (!T(d.salesNotesFromEmail) && T(d.designNotesToEmail)) d.salesNotesFromEmail = d.designNotesToEmail;
  if (!T(d.salesNotesToEmail) && T(d.designNotesFromEmail)) d.salesNotesToEmail = d.designNotesFromEmail;
  if (!T(d.qldSalesNotesFromEmail) && T(d.qldDesignNotesToEmail)) d.qldSalesNotesFromEmail = d.qldDesignNotesToEmail;
  if (!T(d.qldSalesNotesToEmail) && T(d.qldDesignNotesFromEmail)) d.qldSalesNotesToEmail = d.qldDesignNotesFromEmail;
}

function drawingsUploadFieldKeys(fieldGroup) {
  if (fieldGroup === "drawingsUpload") {
    return {
      label: "Drawings Upload",
      fromVic: "designToSalespersonFromEmail",
      fromQld: "qldDesignToSalespersonFromEmail",
      toVic: "designToSalespersonToEmail",
      toQld: "qldDesignToSalespersonToEmail",
      to2Qld: "qldDesignToSalespersonToEmail2",
    };
  }
  if (fieldGroup === "designNotes") {
    return {
      label: "Design Notes",
      fromVic: "designNotesFromEmail",
      fromQld: "qldDesignNotesFromEmail",
      toVic: "designNotesToEmail",
      toQld: "qldDesignNotesToEmail",
    };
  }
  if (fieldGroup === "salesNotes") {
    return {
      label: "Sales Notes",
      fromVic: "salesNotesFromEmail",
      fromQld: "qldSalesNotesFromEmail",
      toVic: "salesNotesToEmail",
      toQld: "qldSalesNotesToEmail",
    };
  }
  if (fieldGroup === "conceptApproved") {
    return {
      label: "Concept Approved",
      fromVic: "conceptApprovedFromEmail",
      fromQld: "qldConceptApprovedFromEmail",
      toVic: "conceptApprovedToEmail",
      toQld: "qldConceptApprovedToEmail",
    };
  }
  if (fieldGroup === "wdsApproved") {
    return {
      label: "WDs Approved",
      fromVic: "wdsApprovedFromEmail",
      fromQld: "qldWdsApprovedFromEmail",
      toVic: "wdsApprovedToEmail",
      toQld: "qldWdsApprovedToEmail",
      to2Vic: "wdsApprovedToEmail2",
      to2Qld: "qldWdsApprovedToEmail2",
    };
  }
  return null;
}

function drawingsSendClientFieldKeys(fieldGroup) {
  if (fieldGroup === "sendDrawingsToClient") {
    return {
      label: "Send Drawings to Client",
      fromVic: "salespersonToClientFromEmail",
      fromQld: "qldSalespersonToClientFromEmail",
      sendVic: "sendToClients",
      sendQld: "qldSendToClients",
      extraPrefix: "",
    };
  }
  return null;
}

const SECTION_OPTIONS = [
  { key: "newProject", label: "New Project" },
  { key: "drawings", label: "Drawings" },
];

/** Per-stream new-project emails (stored on each `… - VIC` / `… - QLD` row separately). */
/** Stored on `clientEmailTo`; expanded at send time to `project.client1_email` when active. */
const NEW_PROJECT_CLIENT_TO_TOKEN = "{Contact1}";

const NEW_PROJECT_SECTIONS = [
  {
    title: "Email to Client",
    fields: [
      { key: "clientEmailFrom", label: "Client Email - From", selectKind: "smtp" },
      { key: "clientEmailTo", label: "Client Email - To", selectKind: "client1ContactTo" },
    ],
  },
  {
    title: "Email to Team",
    fields: [
      { key: "teamEmailFrom", label: "Team Email - From", selectKind: "smtp" },
      { key: "teamEmailTo", label: "Team Email - To", selectKind: "teamEmailToList" },
    ],
  },
];

function defaultNewProjectSectionOpen() {
  const open = { vic: {}, qld: {} };
  for (const s of NEW_PROJECT_SECTIONS) {
    open.vic[s.title] = false;
    open.qld[s.title] = false;
  }
  return open;
}

/** Drawings email groups (VIC / QLD columns) — collapsible blue panels like New Project. */
const DRAWING_EMAIL_SECTIONS = [
  { id: "drawingsUpload", title: "Drawings Upload", kind: "upload", fieldGroup: "drawingsUpload" },
  { id: "sendDrawingsToClient", title: "Send Drawings to Client", kind: "sendClient", fieldGroup: "sendDrawingsToClient" },
  { id: "designNotes", title: "Design Notes", kind: "upload", fieldGroup: "designNotes" },
  { id: "salesNotes", title: "Sales Notes", kind: "upload", fieldGroup: "salesNotes" },
  { id: "conceptApproved", title: "Concept Approved", kind: "upload", fieldGroup: "conceptApproved" },
  { id: "wdsApproved", title: "WDs Approved", kind: "upload", fieldGroup: "wdsApproved" },
];

function defaultDrawingSectionOpen() {
  const open = { vic: {}, qld: {} };
  for (const s of DRAWING_EMAIL_SECTIONS) {
    open.vic[s.id] = false;
    open.qld[s.id] = false;
  }
  return open;
}

function uniqueTrimmedEmails(list) {
  const seen = new Set();
  const out = [];
  for (const e of list || []) {
    const t = String(e ?? "").trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/**
 * `teamEmailTo` in UI state: string[] (trimmed; may include "" while editing).
 * Legacy single string or comma-separated string is split into non-empty addresses.
 */
function coerceNewProjectTeamEmailToArray(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x ?? "").trim());
  const s = String(raw).trim();
  if (!s) return [];
  return uniqueTrimmedEmails(s.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean));
}

/**
 * Payload for PUT: same shape as in-memory (trimmed rows; empty strings kept so
 * new “Add email” rows are not stripped before the round-trip).
 */
function streamSettingsMapForPersist(map) {
  const norm = normalizeStreamSettingsMap(map);
  const out = { ...norm };
  for (const stream of Object.keys(out)) {
    const row = out[stream];
    if (!row || typeof row !== "object" || !row.newProject || typeof row.newProject !== "object") continue;
    out[stream] = {
      ...row,
      newProject: {
        ...row.newProject,
        teamEmailTo: coerceNewProjectTeamEmailToArray(row.newProject.teamEmailTo),
      },
    };
  }
  return out;
}

function defaultNewProjectState() {
  return {
    clientEmailFrom: "",
    clientEmailTo: "",
    teamEmailFrom: "",
    teamEmailTo: [],
  };
}

function defaultDrawingsState() {
  return {
    designToSalespersonFromEmail: "",
    designToSalespersonToEmail: "",
    salespersonToClientFromEmail: "",
    sendToClients: false,
    extraEmail1: false,
    extraEmail1Address: "",
    extraEmail2: false,
    extraEmail2Address: "",
    extraEmail3: false,
    extraEmail3Address: "",
    qldSendToClients: false,
    qldExtraEmail1: false,
    qldExtraEmail1Address: "",
    qldExtraEmail2: false,
    qldExtraEmail2Address: "",
    qldExtraEmail3: false,
    qldExtraEmail3Address: "",
    qldDesignToSalespersonFromEmail: "",
    qldDesignToSalespersonToEmail: "",
    /** QLD-only: second Drawings Upload To slot (merged with primary at send time). */
    qldDesignToSalespersonToEmail2: "",
    qldSalespersonToClientFromEmail: "",
    designNotesFromEmail: "",
    designNotesToEmail: "",
    qldDesignNotesFromEmail: "",
    qldDesignNotesToEmail: "",
    salesNotesFromEmail: "",
    salesNotesToEmail: "",
    qldSalesNotesFromEmail: "",
    qldSalesNotesToEmail: "",
    conceptApprovedFromEmail: "",
    conceptApprovedToEmail: "",
    conceptApprovedSendToClients: false,
    conceptApprovedExtraEmail1: false,
    conceptApprovedExtraEmail1Address: "",
    conceptApprovedExtraEmail2: false,
    conceptApprovedExtraEmail2Address: "",
    conceptApprovedExtraEmail3: false,
    conceptApprovedExtraEmail3Address: "",
    qldConceptApprovedFromEmail: "",
    qldConceptApprovedToEmail: "",
    qldConceptApprovedSendToClients: false,
    qldConceptApprovedExtraEmail1: false,
    qldConceptApprovedExtraEmail1Address: "",
    qldConceptApprovedExtraEmail2: false,
    qldConceptApprovedExtraEmail2Address: "",
    qldConceptApprovedExtraEmail3: false,
    qldConceptApprovedExtraEmail3Address: "",
    wdsApprovedFromEmail: "",
    wdsApprovedToEmail: "",
    wdsApprovedToEmail2: "",
    wdsApprovedSendToClients: false,
    wdsApprovedExtraEmail1: false,
    wdsApprovedExtraEmail1Address: "",
    wdsApprovedExtraEmail2: false,
    wdsApprovedExtraEmail2Address: "",
    wdsApprovedExtraEmail3: false,
    wdsApprovedExtraEmail3Address: "",
    qldWdsApprovedFromEmail: "",
    qldWdsApprovedToEmail: "",
    qldWdsApprovedToEmail2: "",
    qldWdsApprovedSendToClients: false,
    qldWdsApprovedExtraEmail1: false,
    qldWdsApprovedExtraEmail1Address: "",
    qldWdsApprovedExtraEmail2: false,
    qldWdsApprovedExtraEmail2Address: "",
    qldWdsApprovedExtraEmail3: false,
    qldWdsApprovedExtraEmail3Address: "",
  };
}

function normalizeStreamSettingsMap(raw) {
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
  }
  const src = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  const out = {};
  for (const stream of STREAM_OPTIONS) {
    const legacyKey = Object.keys(LEGACY_STREAM_TO_VIC).find((k) => LEGACY_STREAM_TO_VIC[k] === stream) || null;
    const sourceRow =
      (src[stream] && typeof src[stream] === "object" && src[stream]) ||
      (legacyKey && src[legacyKey] && typeof src[legacyKey] === "object" ? src[legacyKey] : null) ||
      {};
    const row = { ...sourceRow };
    row.drawings = { ...defaultDrawingsState(), ...(row.drawings && typeof row.drawings === "object" ? row.drawings : {}) };
    // Keep current values and seed the duplicated QLD-side fields from existing values.
    if (!row.drawings.qldDesignToSalespersonFromEmail) {
      row.drawings.qldDesignToSalespersonFromEmail = row.drawings.designToSalespersonFromEmail || "";
    }
    if (!row.drawings.qldDesignToSalespersonToEmail) {
      row.drawings.qldDesignToSalespersonToEmail = row.drawings.designToSalespersonToEmail || "";
    }
    if (!row.drawings.qldSalespersonToClientFromEmail) {
      row.drawings.qldSalespersonToClientFromEmail = row.drawings.salespersonToClientFromEmail || "";
    }
    if (row.drawings.qldSendToClients == null) {
      row.drawings.qldSendToClients = !!row.drawings.sendToClients;
    }
    if (row.drawings.qldExtraEmail1 == null) row.drawings.qldExtraEmail1 = !!row.drawings.extraEmail1;
    if (!row.drawings.qldExtraEmail1Address) row.drawings.qldExtraEmail1Address = row.drawings.extraEmail1Address || "";
    if (row.drawings.qldExtraEmail2 == null) row.drawings.qldExtraEmail2 = !!row.drawings.extraEmail2;
    if (!row.drawings.qldExtraEmail2Address) row.drawings.qldExtraEmail2Address = row.drawings.extraEmail2Address || "";
    if (row.drawings.qldExtraEmail3 == null) row.drawings.qldExtraEmail3 = !!row.drawings.extraEmail3;
    if (!row.drawings.qldExtraEmail3Address) row.drawings.qldExtraEmail3Address = row.drawings.extraEmail3Address || "";
    seedSalesNotesFromDesignNotesReversed(row.drawings);
    row.newProject = {
      ...defaultNewProjectState(),
      ...(row.newProject && typeof row.newProject === "object" && !Array.isArray(row.newProject) ? row.newProject : {}),
    };
    const np = row.newProject;
    const trim = (v) => (v == null ? "" : String(v).trim());
    if (!trim(np.clientEmailFrom) && np.emailToClientFullDeposit != null) {
      np.clientEmailFrom = String(np.emailToClientFullDeposit || "").trim();
    }
    if (!trim(np.clientEmailTo) && np.emailToClientPartialDeposit != null) {
      np.clientEmailTo = String(np.emailToClientPartialDeposit || "").trim();
    }
    const teamToEmpty =
      np.teamEmailTo == null ||
      (Array.isArray(np.teamEmailTo) && np.teamEmailTo.length === 0) ||
      (typeof np.teamEmailTo === "string" && !String(np.teamEmailTo).trim());
    if (teamToEmpty && np.emailToTeam != null) {
      np.teamEmailTo = String(np.emailToTeam || "").trim();
    }
    delete np.emailToClientFullDeposit;
    delete np.emailToClientPartialDeposit;
    delete np.emailToTeam;
    {
      const c = String(np.clientEmailTo ?? "").trim();
      row.newProject = {
        clientEmailFrom: trim(np.clientEmailFrom),
        clientEmailTo: c ? NEW_PROJECT_CLIENT_TO_TOKEN : "",
        teamEmailFrom: trim(np.teamEmailFrom),
        teamEmailTo: coerceNewProjectTeamEmailToArray(np.teamEmailTo),
      };
    }
    out[stream] = row;
  }
  return out;
}

/** Map selected stream row to the VIC and QLD settings keys (e.g. `ATA - VIC` / `ATA - QLD`). */
function resolveVicQldStreamKeys(streamKey) {
  const s = String(streamKey || "").trim();
  if (/ - VIC$/i.test(s)) {
    return { vicKey: s, qldKey: s.replace(/ - VIC$/i, " - QLD") };
  }
  if (/ - QLD$/i.test(s)) {
    return { vicKey: s.replace(/ - QLD$/i, " - VIC"), qldKey: s };
  }
  return { vicKey: s, qldKey: s };
}

function streamBaseLabel(streamKey) {
  if (streamKey === "SGF - VIC" || streamKey === "SGF - QLD") return "SGF - Retail";
  if (streamKey.startsWith("Dual Dwelling -")) return "Dual Dwelling Investments";
  return streamKey.replace(/\s*-\s*(VIC|QLD)\s*$/i, "");
}

function streamDisplayItems(streamOptions) {
  const byLabel = new Map();
  for (const key of streamOptions) {
    const label = streamBaseLabel(key);
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label).push(key);
  }
  const ordered = [];
  for (const label of STREAM_DISPLAY_ORDER) {
    if (byLabel.has(label)) {
      ordered.push({ label, keys: byLabel.get(label) });
      byLabel.delete(label);
    }
  }
  for (const [label, keys] of byLabel.entries()) {
    ordered.push({ label, keys });
  }
  return ordered;
}

const columnPanelStyle = {
  background: WHITE,
  borderRadius: "10px",
  padding: "12px 14px",
  border: `1px solid ${MONUMENT}33`,
  boxSizing: "border-box",
  minHeight: "120px",
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};

const columnTitleStyle = {
  margin: 0,
  fontSize: "0.95rem",
  fontWeight: 700,
  color: MONUMENT,
  paddingBottom: "6px",
  borderBottom: `1px solid ${MONUMENT}22`,
};

const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: "8px",
  border: `1px solid ${MONUMENT}33`,
  fontSize: "0.88rem",
  color: MONUMENT,
  background: WHITE,
  boxSizing: "border-box",
};

const selectStyle = {
  ...inputStyle,
  cursor: "pointer",
};

function NewProjectTeamEmailToListEditor({ emails, disabled, onListChange, onCommit }) {
  const list = coerceNewProjectTeamEmailToArray(emails);

  function updateAt(i, val) {
    const next = [...list];
    next[i] = val;
    onListChange(next);
  }

  function addRow() {
    onListChange([...list, ""]);
    onCommit();
  }

  function removeAt(i) {
    onListChange(list.filter((_, j) => j !== i));
    onCommit();
  }

  const btnStyle = {
    fontSize: "0.82rem",
    fontWeight: 600,
    padding: "6px 10px",
    borderRadius: "8px",
    border: `1px solid ${MONUMENT}55`,
    background: WHITE,
    color: MONUMENT,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
  };

  const scrollAreaStyle = {
    maxHeight: "min(28vh, 200px)",
    overflowY: "auto",
    overflowX: "hidden",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    minHeight: 0,
    paddingRight: "6px",
    boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: 0 }}>
      <div style={scrollAreaStyle}>
        {list.length === 0 ? (
          <span style={{ fontSize: "0.82rem", color: `${MONUMENT}99` }}>No addresses yet.</span>
        ) : null}
        {list.map((email, i) => (
          <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center", minWidth: 0 }}>
            <input
              type="text"
              autoComplete="off"
              value={email}
              onChange={(e) => updateAt(i, e.target.value)}
              onBlur={onCommit}
              disabled={disabled}
              placeholder="name@example.com"
              style={{ ...inputStyle, flex: 1, minWidth: 0 }}
            />
            <button type="button" disabled={disabled} style={btnStyle} onClick={() => removeAt(i)}>
              Remove
            </button>
          </div>
        ))}
      </div>
      <div style={{ flexShrink: 0 }}>
        <button type="button" disabled={disabled} style={btnStyle} onClick={addRow}>
          Add email
        </button>
      </div>
    </div>
  );
}

function NewProjectClientEmailToSelect({ value, disabled, onValueChange, onCommit }) {
  const v = value == null ? "" : String(value).trim();
  const canonical = /^\{contact1\}$/i.test(v) ? NEW_PROJECT_CLIENT_TO_TOKEN : "";
  const orphan = v !== "" && canonical === "";

  return (
    <select
      value={canonical || (orphan ? v : "")}
      disabled={disabled}
      onChange={(e) => {
        const next = e.target.value;
        onValueChange(next === NEW_PROJECT_CLIENT_TO_TOKEN ? NEW_PROJECT_CLIENT_TO_TOKEN : "");
      }}
      onBlur={onCommit}
      style={selectStyle}
    >
      <option value="">— None —</option>
      <option value={NEW_PROJECT_CLIENT_TO_TOKEN}>Client 1 contact email ({NEW_PROJECT_CLIENT_TO_TOKEN})</option>
      {orphan ? (
        <option value={v}>
          {v} (legacy — pick {NEW_PROJECT_CLIENT_TO_TOKEN} or None)
        </option>
      ) : null}
    </select>
  );
}

function DrawingNotifySmtpSelect({ smtpOptions, value, disabled, onValueChange, onCommit }) {
  const v = value == null ? "" : String(value).trim();
  const resolved =
    v === "" ? "" : smtpOptions.find((o) => o.toLowerCase() === v.toLowerCase()) ?? v;
  const orphan = v !== "" && !smtpOptions.some((o) => o.toLowerCase() === v.toLowerCase());

  return (
    <select
      value={resolved}
      disabled={disabled}
      onChange={(e) => onValueChange(e.target.value)}
      onBlur={onCommit}
      style={selectStyle}
    >
      <option value="">— None —</option>
      {smtpOptions.map((email) => (
        <option key={email} value={email}>
          {email}
        </option>
      ))}
      {orphan ? (
        <option value={v}>
          {v} (not in SMTP list)
        </option>
      ) : null}
    </select>
  );
}

/** Left column: global email settings (not tied to a stream row). */
const EMAIL_NAV_GENERAL = "general";

const GLOBAL_EMAIL_SECTIONS = [
  { key: "colours", label: "Colours" },
  { key: "hotList", label: "Hot List" },
  { key: "windows", label: "Windows" },
];

export default function StreamSettings() {
  const [emailNavScope, setEmailNavScope] = useState("stream"); // "stream" | EMAIL_NAV_GENERAL
  const [selectedStream, setSelectedStream] = useState(STREAM_OPTIONS[0]);
  const [activeSection, setActiveSection] = useState("drawings");
  const [globalEmailSection, setGlobalEmailSection] = useState("colours");
  const [streamSettingsMap, setStreamSettingsMap] = useState(() => normalizeStreamSettingsMap({}));
  const streamSettingsMapRef = useRef(streamSettingsMap);
  streamSettingsMapRef.current = streamSettingsMap;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [smtpSlotEmails, setSmtpSlotEmails] = useState([]);
  const [newProjectSectionOpen, setNewProjectSectionOpen] = useState(defaultNewProjectSectionOpen);
  const [drawingSectionOpen, setDrawingSectionOpen] = useState(defaultDrawingSectionOpen);
  const [hotListSoldSectionOpen, setHotListSoldSectionOpen] = useState(false);
  const [windowsOrderingSectionOpen, setWindowsOrderingSectionOpen] = useState(false);
  const [emailGeneral, setEmailGeneral] = useState(() => parseEmailGeneralJson(null));
  const emailGeneralRef = useRef(emailGeneral);
  emailGeneralRef.current = emailGeneral;
  const streamDisplayList = streamDisplayItems(STREAM_OPTIONS);

  useEffect(() => {
    if (emailNavScope !== "stream") return;
    if (activeSection === "newProject") {
      setNewProjectSectionOpen(defaultNewProjectSectionOpen());
    }
    if (activeSection === "drawings") {
      setDrawingSectionOpen(defaultDrawingSectionOpen());
    }
  }, [activeSection, emailNavScope]);

  useEffect(() => {
    if (activeSection === "colours") {
      setActiveSection("drawings");
    }
  }, [activeSection]);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/settings`);
      if (!res.ok) throw new Error("Failed to load settings");
      const data = await res.json();
      setStreamSettingsMap(normalizeStreamSettingsMap(data.stream_settings_json));
      setSmtpSlotEmails(smtpSlotEmailsFromSettings(data));
      const eg = parseEmailGeneralJson(data.email_general_json);
      setEmailGeneral(eg);
      emailGeneralRef.current = eg;
    } catch (e) {
      console.error(e);
      setStreamSettingsMap(normalizeStreamSettingsMap({}));
      setSmtpSlotEmails([]);
      const eg = parseEmailGeneralJson(null);
      setEmailGeneral(eg);
      emailGeneralRef.current = eg;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function persistStreamSettings(nextMap) {
    try {
      setSaving(true);
      const res = await fetch(`${API_URL}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stream_settings_json: streamSettingsMapForPersist(nextMap) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || res.statusText);
      }
      const data = await res.json();
      setStreamSettingsMap(normalizeStreamSettingsMap(data.stream_settings_json));
      setSmtpSlotEmails(smtpSlotEmailsFromSettings(data));
      const eg = parseEmailGeneralJson(data.email_general_json);
      setEmailGeneral(eg);
      emailGeneralRef.current = eg;
    } catch (e) {
      console.error(e);
      alert(`Could not save stream settings: ${e.message}`);
      await loadSettings();
    } finally {
      setSaving(false);
    }
  }

  async function persistEmailGeneral(nextJson) {
    try {
      setSaving(true);
      const res = await fetch(`${API_URL}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_general_json: nextJson }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || res.statusText);
      }
      const data = await res.json();
      const eg = parseEmailGeneralJson(data.email_general_json);
      setEmailGeneral(eg);
      emailGeneralRef.current = eg;
      setSmtpSlotEmails(smtpSlotEmailsFromSettings(data));
    } catch (e) {
      console.error(e);
      alert(`Could not save General email settings: ${e.message}`);
      await loadSettings();
    } finally {
      setSaving(false);
    }
  }

  function updateHotListSoldField(fieldKey, value) {
    setEmailGeneral((prev) => {
      const next = {
        ...prev,
        hotList: { ...prev.hotList, [fieldKey]: value },
      };
      emailGeneralRef.current = next;
      return next;
    });
  }

  function flushPersistHotListEmail() {
    void persistEmailGeneral(emailGeneralRef.current);
  }

  function updateWindowsField(fieldKey, value) {
    setEmailGeneral((prev) => {
      const next = {
        ...prev,
        windows: { ...(prev.windows || {}), [fieldKey]: value },
      };
      emailGeneralRef.current = next;
      return next;
    });
  }

  function flushPersistWindowsEmail() {
    void persistEmailGeneral(emailGeneralRef.current);
  }

  function toggleDrawingOption(stream, optionKey) {
    const next = normalizeStreamSettingsMap(streamSettingsMapRef.current);
    const cur = !!next[stream].drawings[optionKey];
    next[stream] = {
      ...next[stream],
      drawings: { ...next[stream].drawings, [optionKey]: !cur },
    };
    streamSettingsMapRef.current = next;
    setStreamSettingsMap(next);
    void persistStreamSettings(next);
  }

  function updateDrawingText(stream, addrKey, value) {
    const next = normalizeStreamSettingsMap(streamSettingsMapRef.current);
    next[stream] = {
      ...next[stream],
      drawings: { ...next[stream].drawings, [addrKey]: value },
    };
    streamSettingsMapRef.current = next;
    setStreamSettingsMap(next);
  }

  function updateNewProjectText(stream, fieldKey, value) {
    let v = value;
    if (fieldKey === "clientEmailTo") {
      const t = v == null ? "" : String(v).trim();
      v = !t ? "" : /^\{contact1\}$/i.test(t) ? NEW_PROJECT_CLIENT_TO_TOKEN : "";
    }
    if (fieldKey === "teamEmailTo") {
      v = coerceNewProjectTeamEmailToArray(v);
    }
    const next = normalizeStreamSettingsMap(streamSettingsMapRef.current);
    next[stream] = {
      ...next[stream],
      newProject: {
        ...defaultNewProjectState(),
        ...(next[stream].newProject && typeof next[stream].newProject === "object" ? next[stream].newProject : {}),
        [fieldKey]: v,
      },
    };
    streamSettingsMapRef.current = next;
    setStreamSettingsMap(next);
  }

  function flushPersist() {
    void persistStreamSettings(normalizeStreamSettingsMap(streamSettingsMapRef.current));
  }

  const selectedStreamLabel = streamBaseLabel(selectedStream);
  const { vicKey, qldKey } = resolveVicQldStreamKeys(selectedStream);
  const vicNewProject = streamSettingsMap[vicKey]?.newProject || defaultNewProjectState();
  const qldNewProject = streamSettingsMap[qldKey]?.newProject || defaultNewProjectState();
  const drawingsVicRow = streamSettingsMap[vicKey]?.drawings || defaultDrawingsState();
  const drawingsQldRow = streamSettingsMap[qldKey]?.drawings || defaultDrawingsState();

  return (
    <>
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "grid",
        gridTemplateColumns: "260px 220px minmax(0, 1fr)",
        alignItems: "flex-start",
        padding: "16px",
        gap: "16px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "fit-content",
          minWidth: "240px",
          alignSelf: "stretch",
          backgroundColor: "#E5E5E7",
          border: `2px solid ${MONUMENT}`,
          borderRadius: "10px",
          padding: "14px 16px",
          color: MONUMENT,
          boxSizing: "border-box",
        }}
      >
        <h3 style={{ margin: "0 0 12px 0", fontSize: "1rem", fontWeight: 700 }}>
          General & streams ({streamDisplayList.length + 1})
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <button
            type="button"
            onClick={() => {
              setEmailNavScope(EMAIL_NAV_GENERAL);
              setGlobalEmailSection("colours");
            }}
            style={{
              width: "fit-content",
              minWidth: "100%",
              background: emailNavScope === EMAIL_NAV_GENERAL ? WHITE : "transparent",
              color: emailNavScope === EMAIL_NAV_GENERAL ? MONUMENT : "#404049",
              border: "none",
              borderRadius: "10px",
              padding: "10px 8px",
              fontSize: "0.95rem",
              fontWeight: 600,
              textAlign: "center",
              letterSpacing: "0.3px",
              cursor: "pointer",
              transition: "background 0.18s, color 0.15s",
              outline: emailNavScope === EMAIL_NAV_GENERAL ? `2px solid ${MONUMENT}` : "none",
              boxShadow: emailNavScope === EMAIL_NAV_GENERAL ? "0 2px 4px rgba(50,50,51,.04)" : "none",
            }}
          >
            General
          </button>
          {streamDisplayList.map(({ label, keys }) => {
            const isSelected = emailNavScope === "stream" && keys.includes(selectedStream);
            const onPick = () => {
              setEmailNavScope("stream");
              setSelectedStream(isSelected ? selectedStream : keys[0]);
            };
            return (
            <button
              key={label}
              type="button"
              onClick={onPick}
              style={{
                width: "fit-content",
                minWidth: "100%",
                background: isSelected ? WHITE : "transparent",
                color: isSelected ? MONUMENT : "#404049",
                border: "none",
                borderRadius: "10px",
                padding: "10px 8px",
                fontSize: "0.95rem",
                fontWeight: 500,
                textAlign: "center",
                letterSpacing: "0.3px",
                cursor: "pointer",
                transition: "background 0.18s, color 0.15s",
                outline: isSelected ? `2px solid ${MONUMENT}` : "none",
                boxShadow: isSelected ? "0 2px 4px rgba(50,50,51,.04)" : "none",
              }}
            >
              {label}
            </button>
          );})}
        </div>

      </div>

      <div
        style={{
          alignSelf: "stretch",
          backgroundColor: "#E5E5E7",
          border: `2px solid ${MONUMENT}`,
          borderRadius: "10px",
          padding: "14px 12px",
          color: MONUMENT,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        <h4 style={{ margin: "0 0 4px 0", fontSize: "0.92rem", fontWeight: 700 }}>Sections</h4>
        {emailNavScope === EMAIL_NAV_GENERAL
          ? GLOBAL_EMAIL_SECTIONS.map((section) => {
              const isOpen = globalEmailSection === section.key;
              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() =>
                    setGlobalEmailSection((prev) => (prev === section.key ? null : section.key))
                  }
                  style={{
                    width: "100%",
                    background: isOpen ? WHITE : "transparent",
                    color: isOpen ? MONUMENT : "#404049",
                    border: "none",
                    borderRadius: "10px",
                    padding: "10px 8px",
                    fontSize: "0.92rem",
                    fontWeight: 500,
                    textAlign: "left",
                    letterSpacing: "0.2px",
                    cursor: "pointer",
                    outline: isOpen ? `2px solid ${MONUMENT}` : "none",
                  }}
                >
                  {section.label} {isOpen ? "▾" : "▸"}
                </button>
              );
            })
          : SECTION_OPTIONS.map((section) => {
              const isOpen = activeSection === section.key;
              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => setActiveSection((prev) => (prev === section.key ? null : section.key))}
                  style={{
                    width: "100%",
                    background: isOpen ? WHITE : "transparent",
                    color: isOpen ? MONUMENT : "#404049",
                    border: "none",
                    borderRadius: "10px",
                    padding: "10px 8px",
                    fontSize: "0.92rem",
                    fontWeight: 500,
                    textAlign: "left",
                    letterSpacing: "0.2px",
                    cursor: "pointer",
                    outline: isOpen ? `2px solid ${MONUMENT}` : "none",
                  }}
                >
                  {section.label} {isOpen ? "▾" : "▸"}
                </button>
              );
            })}
      </div>

      <div
        style={{
          alignSelf: "stretch",
          backgroundColor: "#E5E5E7",
          border: `2px solid ${MONUMENT}`,
          borderRadius: "10px",
          padding: "16px",
          color: MONUMENT,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          minWidth: 0,
        }}
      >
        <h3 style={{ margin: "0 0 12px 0", fontSize: "1.05rem", fontWeight: 700 }}>
          {emailNavScope === EMAIL_NAV_GENERAL ? "General" : selectedStreamLabel}
        </h3>

        {loading ? (
          <div style={{ fontSize: "0.95rem", color: "#32323399" }}>Loading stream settings…</div>
        ) : emailNavScope === EMAIL_NAV_GENERAL ? (
          !globalEmailSection ? (
            <div style={{ fontSize: "0.95rem", color: "#32323399" }}>Select a section in column 2.</div>
          ) : globalEmailSection === "colours" ? (
            <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" }}>
              <div style={{ ...columnPanelStyle, minHeight: "100%" }}>
                <h4 style={{ ...columnTitleStyle, marginBottom: "10px" }}>Colours</h4>
                <p style={{ margin: 0, fontSize: "0.88rem", color: "#32323399", lineHeight: 1.45 }}>
                  Colour email options will go here.
                </p>
              </div>
            </div>
          ) : globalEmailSection === "hotList" ? (
            <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" }}>
              <div style={{ ...columnPanelStyle, minHeight: "100%" }}>
                <h4 style={{ ...columnTitleStyle, marginBottom: "10px" }}>Hot List</h4>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: hotListSoldSectionOpen ? "10px" : "0",
                    ...NEW_PROJECT_SECTION_BLUE,
                  }}
                >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                    padding: "2px 0 8px 0",
                    borderBottom: hotListSoldSectionOpen ? "1px solid #4d93d955" : "none",
                  }}
                >
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setHotListSoldSectionOpen((o) => !o)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "8px",
                      flex: 1,
                      minWidth: 0,
                      margin: 0,
                      padding: 0,
                      border: "none",
                      background: "transparent",
                      cursor: saving ? "wait" : "pointer",
                      textAlign: "left",
                      fontFamily: "inherit",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.82rem",
                        fontWeight: 700,
                        color: "#1e4d7a",
                        letterSpacing: "0.02em",
                      }}
                    >
                      Sold email
                    </span>
                    <span aria-hidden style={{ fontSize: "0.75rem", color: "#1e4d7a", flexShrink: 0 }}>
                      {hotListSoldSectionOpen ? "▾" : "▸"}
                    </span>
                  </button>
                </div>
                {hotListSoldSectionOpen ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: "12px",
                    }}
                  >
                    <div style={{ ...columnPanelStyle, minHeight: 0, margin: 0 }}>
                      <h5 style={{ margin: "0 0 10px 0", fontSize: "0.9rem", fontWeight: 700, color: MONUMENT }}>VIC</h5>
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <span style={{ fontSize: "0.78rem", fontWeight: 600, color: `${MONUMENT}b3` }}>From</span>
                          <DrawingNotifySmtpSelect
                            smtpOptions={smtpSlotEmails}
                            value={emailGeneral.hotList?.soldFromEmail || ""}
                            disabled={saving}
                            onValueChange={(next) => updateHotListSoldField("soldFromEmail", next)}
                            onCommit={flushPersistHotListEmail}
                          />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <span style={{ fontSize: "0.78rem", fontWeight: 600, color: `${MONUMENT}b3` }}>To</span>
                          <DrawingNotifySmtpSelect
                            smtpOptions={smtpSlotEmails}
                            value={emailGeneral.hotList?.soldToEmail || ""}
                            disabled={saving}
                            onValueChange={(next) => updateHotListSoldField("soldToEmail", next)}
                            onCommit={flushPersistHotListEmail}
                          />
                        </div>
                      </div>
                    </div>
                    <div style={{ ...columnPanelStyle, minHeight: 0, margin: 0 }}>
                      <h5 style={{ margin: "0 0 10px 0", fontSize: "0.9rem", fontWeight: 700, color: MONUMENT }}>QLD</h5>
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <span style={{ fontSize: "0.78rem", fontWeight: 600, color: `${MONUMENT}b3` }}>From</span>
                          <DrawingNotifySmtpSelect
                            smtpOptions={smtpSlotEmails}
                            value={emailGeneral.hotList?.qldSoldFromEmail || ""}
                            disabled={saving}
                            onValueChange={(next) => updateHotListSoldField("qldSoldFromEmail", next)}
                            onCommit={flushPersistHotListEmail}
                          />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <span style={{ fontSize: "0.78rem", fontWeight: 600, color: `${MONUMENT}b3` }}>To</span>
                          <DrawingNotifySmtpSelect
                            smtpOptions={smtpSlotEmails}
                            value={emailGeneral.hotList?.qldSoldToEmail || ""}
                            disabled={saving}
                            onValueChange={(next) => updateHotListSoldField("qldSoldToEmail", next)}
                            onCommit={flushPersistHotListEmail}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
                </div>
              </div>
            </div>
          ) : globalEmailSection === "windows" ? (
            <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" }}>
              <div style={{ ...columnPanelStyle, minHeight: "100%" }}>
                <h4 style={{ ...columnTitleStyle, marginBottom: "10px" }}>Windows</h4>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: windowsOrderingSectionOpen ? "10px" : "0",
                    ...NEW_PROJECT_SECTION_BLUE,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "8px",
                      padding: "2px 0 8px 0",
                      borderBottom: windowsOrderingSectionOpen ? "1px solid #4d93d955" : "none",
                    }}
                  >
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setWindowsOrderingSectionOpen((o) => !o)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "8px",
                        flex: 1,
                        minWidth: 0,
                        margin: 0,
                        padding: 0,
                        border: "none",
                        background: "transparent",
                        cursor: saving ? "wait" : "pointer",
                        textAlign: "left",
                        fontFamily: "inherit",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          color: "#1e4d7a",
                          letterSpacing: "0.02em",
                        }}
                      >
                        Ordering Windows
                      </span>
                      <span aria-hidden style={{ fontSize: "0.75rem", color: "#1e4d7a", flexShrink: 0 }}>
                        {windowsOrderingSectionOpen ? "▾" : "▸"}
                      </span>
                    </button>
                  </div>
                  {windowsOrderingSectionOpen ? (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: "12px",
                      }}
                    >
                      <div style={{ ...columnPanelStyle, minHeight: 0, margin: 0 }}>
                        <h5 style={{ margin: "0 0 10px 0", fontSize: "0.9rem", fontWeight: 700, color: MONUMENT }}>VIC</h5>
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <span style={{ fontSize: "0.78rem", fontWeight: 600, color: `${MONUMENT}b3` }}>From</span>
                            <DrawingNotifySmtpSelect
                              smtpOptions={smtpSlotEmails}
                              value={emailGeneral.windows?.vicFromEmail || ""}
                              disabled={saving}
                              onValueChange={(next) => updateWindowsField("vicFromEmail", next)}
                              onCommit={flushPersistWindowsEmail}
                            />
                          </div>
                          {[1, 2, 3].map((n) => (
                            <div key={`vic-to-${n}`} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              <span style={{ fontSize: "0.78rem", fontWeight: 600, color: `${MONUMENT}b3` }}>{`To ${n}`}</span>
                              <input
                                type="text"
                                autoComplete="off"
                                disabled={saving}
                                value={emailGeneral.windows?.[`vicToEmail${n}`] || ""}
                                onChange={(e) => updateWindowsField(`vicToEmail${n}`, e.target.value)}
                                onBlur={flushPersistWindowsEmail}
                                placeholder="name@example.com"
                                style={inputStyle}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                      <div style={{ ...columnPanelStyle, minHeight: 0, margin: 0 }}>
                        <h5 style={{ margin: "0 0 10px 0", fontSize: "0.9rem", fontWeight: 700, color: MONUMENT }}>QLD</h5>
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <span style={{ fontSize: "0.78rem", fontWeight: 600, color: `${MONUMENT}b3` }}>From</span>
                            <DrawingNotifySmtpSelect
                              smtpOptions={smtpSlotEmails}
                              value={emailGeneral.windows?.qldFromEmail || ""}
                              disabled={saving}
                              onValueChange={(next) => updateWindowsField("qldFromEmail", next)}
                              onCommit={flushPersistWindowsEmail}
                            />
                          </div>
                          {[1, 2, 3].map((n) => (
                            <div key={`qld-to-${n}`} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              <span style={{ fontSize: "0.78rem", fontWeight: 600, color: `${MONUMENT}b3` }}>{`To ${n}`}</span>
                              <input
                                type="text"
                                autoComplete="off"
                                disabled={saving}
                                value={emailGeneral.windows?.[`qldToEmail${n}`] || ""}
                                onChange={(e) => updateWindowsField(`qldToEmail${n}`, e.target.value)}
                                onBlur={flushPersistWindowsEmail}
                                placeholder="name@example.com"
                                style={inputStyle}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null
        ) : !activeSection ? (
          <div style={{ fontSize: "0.95rem", color: "#32323399" }}>Select a section in column 2.</div>
        ) : (
          <div style={{ flex: 1, minHeight: 0 }}>
            {activeSection === "newProject" ? (
              <div style={{ ...columnPanelStyle, minHeight: "100%" }}>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                    paddingBottom: "6px",
                    borderBottom: `1px solid ${MONUMENT}22`,
                    marginBottom: "10px",
                  }}
                >
                  <h4 style={{ ...columnTitleStyle, margin: 0, paddingBottom: 0, borderBottom: "none", flex: "1 1 140px" }}>
                    New Project
                  </h4>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
                  {[
                    { title: "VIC", streamKey: vicKey, data: vicNewProject },
                    { title: "QLD", streamKey: qldKey, data: qldNewProject },
                  ].map(({ title, streamKey, data }) => {
                    const columnKey = title === "VIC" ? "vic" : "qld";
                    return (
                    <div key={title} style={{ ...columnPanelStyle, minHeight: 0 }}>
                      <h5 style={{ margin: "0 0 8px 0", fontSize: "0.9rem", fontWeight: 700, color: MONUMENT }}>{title}</h5>
                      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        {NEW_PROJECT_SECTIONS.map((section) => {
                          const sectionExpanded = !!newProjectSectionOpen[columnKey]?.[section.title];
                          return (
                          <div
                            key={section.title}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: sectionExpanded ? "10px" : "0",
                              ...NEW_PROJECT_SECTION_BLUE,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "8px",
                                padding: "2px 0 8px 0",
                                borderBottom: sectionExpanded ? "1px solid #4d93d955" : "none",
                              }}
                            >
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => {
                                  setNewProjectSectionOpen((prev) => {
                                    const currentlyOpen = !!prev[columnKey]?.[section.title];
                                    const nextColumnState = {};
                                    for (const s of NEW_PROJECT_SECTIONS) {
                                      nextColumnState[s.title] = false;
                                    }
                                    if (!currentlyOpen) {
                                      nextColumnState[section.title] = true;
                                    }
                                    return {
                                      ...prev,
                                      [columnKey]: nextColumnState,
                                    };
                                  });
                                }}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: "8px",
                                  flex: 1,
                                  minWidth: 0,
                                  margin: 0,
                                  padding: 0,
                                  border: "none",
                                  background: "transparent",
                                  cursor: saving ? "wait" : "pointer",
                                  textAlign: "left",
                                  fontFamily: "inherit",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "0.82rem",
                                    fontWeight: 700,
                                    color: "#1e4d7a",
                                    letterSpacing: "0.02em",
                                  }}
                                >
                                  {section.title}
                                </span>
                                <span aria-hidden style={{ fontSize: "0.75rem", color: "#1e4d7a", flexShrink: 0 }}>
                                  {sectionExpanded ? "▾" : "▸"}
                                </span>
                              </button>
                            </div>
                            {sectionExpanded ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                              {section.fields.map(({ key, label, selectKind = "smtp" }) => (
                                <div key={key} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                  <span style={{ fontSize: "0.78rem", fontWeight: 600, color: `${MONUMENT}b3` }}>{label}</span>
                                  {selectKind === "client1ContactTo" ? (
                                    <NewProjectClientEmailToSelect
                                      value={data[key] || ""}
                                      disabled={saving}
                                      onValueChange={(next) => updateNewProjectText(streamKey, key, next)}
                                      onCommit={flushPersist}
                                    />
                                  ) : selectKind === "teamEmailToList" ? (
                                    <NewProjectTeamEmailToListEditor
                                      emails={data.teamEmailTo}
                                      disabled={saving}
                                      onListChange={(next) => updateNewProjectText(streamKey, "teamEmailTo", next)}
                                      onCommit={flushPersist}
                                    />
                                  ) : (
                                    <DrawingNotifySmtpSelect
                                      smtpOptions={smtpSlotEmails}
                                      value={data[key] || ""}
                                      disabled={saving}
                                      onValueChange={(next) => updateNewProjectText(streamKey, key, next)}
                                      onCommit={flushPersist}
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                            ) : null}
                          </div>
                          );
                        })}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {activeSection === "drawings" ? (
              <div style={{ ...columnPanelStyle, minHeight: "100%" }}>
                <h4
                  style={{
                    ...columnTitleStyle,
                    margin: 0,
                    paddingBottom: "6px",
                    borderBottom: `1px solid ${MONUMENT}22`,
                    marginBottom: "10px",
                  }}
                >
                  Drawings
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
                  {["VIC", "QLD"].map((colTitle) => {
                    const columnKey = colTitle === "VIC" ? "vic" : "qld";
                    const isQld = colTitle === "QLD";
                    const rowKey = isQld ? qldKey : vicKey;
                    const d = isQld ? drawingsQldRow : drawingsVicRow;
                    return (
                      <div key={colTitle} style={{ ...columnPanelStyle, minHeight: 0 }}>
                        <h5 style={{ margin: "0 0 8px 0", fontSize: "0.9rem", fontWeight: 700, color: MONUMENT }}>{colTitle}</h5>
                        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                          {DRAWING_EMAIL_SECTIONS.map((section) => {
                            const sectionExpanded = !!drawingSectionOpen[columnKey]?.[section.id];
                            return (
                              <div
                                key={section.id}
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: sectionExpanded ? "10px" : "0",
                                  ...NEW_PROJECT_SECTION_BLUE,
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: "8px",
                                    padding: "2px 0 8px 0",
                                    borderBottom: sectionExpanded ? "1px solid #4d93d955" : "none",
                                  }}
                                >
                                  <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() => {
                                      setDrawingSectionOpen((prev) => {
                                        const currentlyOpen = !!prev[columnKey]?.[section.id];
                                        const nextColumnState = {};
                                        for (const s of DRAWING_EMAIL_SECTIONS) {
                                          nextColumnState[s.id] = false;
                                        }
                                        if (!currentlyOpen) {
                                          nextColumnState[section.id] = true;
                                        }
                                        return {
                                          ...prev,
                                          [columnKey]: nextColumnState,
                                        };
                                      });
                                    }}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      gap: "8px",
                                      flex: 1,
                                      minWidth: 0,
                                      margin: 0,
                                      padding: 0,
                                      border: "none",
                                      background: "transparent",
                                      cursor: saving ? "wait" : "pointer",
                                      textAlign: "left",
                                      fontFamily: "inherit",
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: "0.82rem",
                                        fontWeight: 700,
                                        color: "#1e4d7a",
                                        letterSpacing: "0.02em",
                                      }}
                                    >
                                      {section.title}
                                    </span>
                                    <span aria-hidden style={{ fontSize: "0.75rem", color: "#1e4d7a", flexShrink: 0 }}>
                                      {sectionExpanded ? "▾" : "▸"}
                                    </span>
                                  </button>
                                </div>
                                {sectionExpanded ? (
                                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                    {section.kind === "upload"
                                      ? (() => {
                                          const K = drawingsUploadFieldKeys(section.fieldGroup);
                                          if (!K) return null;
                                          const fromKey = isQld ? K.fromQld : K.fromVic;
                                          const toKey = isQld ? K.toQld : K.toVic;
                                          return (
                                            <>
                                              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                                <span style={{ fontSize: "0.78rem", fontWeight: 600, color: `${MONUMENT}b3` }}>
                                                  {K.label} — From
                                                </span>
                                                <DrawingNotifySmtpSelect
                                                  smtpOptions={smtpSlotEmails}
                                                  value={d[fromKey] || ""}
                                                  disabled={saving}
                                                  onValueChange={(next) => {
                                                    updateDrawingText(rowKey, fromKey, next);
                                                  }}
                                                  onCommit={flushPersist}
                                                />
                                              </div>
                                              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                                <span style={{ fontSize: "0.78rem", fontWeight: 600, color: `${MONUMENT}b3` }}>
                                                  {K.label} — To
                                                </span>
                                                <DrawingNotifySmtpSelect
                                                  smtpOptions={smtpSlotEmails}
                                                  value={d[toKey] || ""}
                                                  disabled={saving}
                                                  onValueChange={(next) => {
                                                    updateDrawingText(rowKey, toKey, next);
                                                  }}
                                                  onCommit={flushPersist}
                                                />
                                              </div>
                                              {!isQld && K.to2Vic ? (
                                                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                                  <span style={{ fontSize: "0.78rem", fontWeight: 600, color: `${MONUMENT}b3` }}>
                                                    {K.label} — To (additional)
                                                  </span>
                                                  <DrawingNotifySmtpSelect
                                                    smtpOptions={smtpSlotEmails}
                                                    value={d[K.to2Vic] || ""}
                                                    disabled={saving}
                                                    onValueChange={(next) => {
                                                      updateDrawingText(rowKey, K.to2Vic, next);
                                                    }}
                                                    onCommit={flushPersist}
                                                  />
                                                </div>
                                              ) : null}
                                              {isQld && K.to2Qld ? (
                                                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                                  <span style={{ fontSize: "0.78rem", fontWeight: 600, color: `${MONUMENT}b3` }}>
                                                    {K.label} — To (additional)
                                                  </span>
                                                  <DrawingNotifySmtpSelect
                                                    smtpOptions={smtpSlotEmails}
                                                    value={d[K.to2Qld] || ""}
                                                    disabled={saving}
                                                    onValueChange={(next) => {
                                                      updateDrawingText(rowKey, K.to2Qld, next);
                                                    }}
                                                    onCommit={flushPersist}
                                                  />
                                                </div>
                                              ) : null}
                                            </>
                                          );
                                        })()
                                      : section.kind === "sendClient"
                                        ? (() => {
                                            const K = drawingsSendClientFieldKeys(section.fieldGroup);
                                            if (!K) return null;
                                            const fromKey = isQld ? K.fromQld : K.fromVic;
                                            const sendKey = isQld ? K.sendQld : K.sendVic;
                                            const slots = drawingsSendClientExtraSlotDefs(K.extraPrefix);
                                            return (
                                              <>
                                                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                                  <span style={{ fontSize: "0.78rem", fontWeight: 600, color: `${MONUMENT}b3` }}>
                                                    {K.label} — From
                                                  </span>
                                                  <DrawingNotifySmtpSelect
                                                    smtpOptions={smtpSlotEmails}
                                                    value={d[fromKey] || ""}
                                                    disabled={saving}
                                                    onValueChange={(next) => {
                                                      updateDrawingText(rowKey, fromKey, next);
                                                    }}
                                                    onCommit={flushPersist}
                                                  />
                                                </div>
                                                <label
                                                  style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "10px",
                                                    fontSize: "0.92rem",
                                                    color: MONUMENT,
                                                    cursor: saving ? "wait" : "pointer",
                                                    fontWeight: 500,
                                                  }}
                                                >
                                                  <input
                                                    type="checkbox"
                                                    checked={!!d[sendKey]}
                                                    disabled={saving}
                                                    onChange={() => toggleDrawingOption(rowKey, sendKey)}
                                                    style={{ width: "18px", height: "18px", cursor: saving ? "wait" : "pointer" }}
                                                  />
                                                  Send to Clients
                                                </label>
                                                {slots.map(({ checkKey, addrKey, label }) => {
                                                  const qldCheckKey = qldDrawingsKey(checkKey);
                                                  const qldAddrKey = qldDrawingsKey(addrKey);
                                                  const useCheckKey = isQld ? qldCheckKey : checkKey;
                                                  const useAddrKey = isQld ? qldAddrKey : addrKey;
                                                  return (
                                                    <div key={`${colTitle}-${section.id}-${checkKey}`} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                                      <label
                                                        style={{
                                                          display: "flex",
                                                          alignItems: "center",
                                                          gap: "10px",
                                                          fontSize: "0.92rem",
                                                          color: MONUMENT,
                                                          cursor: saving ? "wait" : "pointer",
                                                          fontWeight: 500,
                                                        }}
                                                      >
                                                        <input
                                                          type="checkbox"
                                                          checked={!!d[useCheckKey]}
                                                          disabled={saving}
                                                          onChange={() => toggleDrawingOption(rowKey, useCheckKey)}
                                                          style={{ width: "18px", height: "18px", cursor: saving ? "wait" : "pointer" }}
                                                        />
                                                        {label}
                                                      </label>
                                                      <input
                                                        type="email"
                                                        autoComplete="off"
                                                        placeholder="email@example.com"
                                                        value={d[useAddrKey] || ""}
                                                        disabled={saving}
                                                        onChange={(e) => updateDrawingText(rowKey, useAddrKey, e.target.value)}
                                                        onBlur={() => flushPersist()}
                                                        style={inputStyle}
                                                      />
                                                    </div>
                                                  );
                                                })}
                                              </>
                                            );
                                          })()
                                        : null}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
