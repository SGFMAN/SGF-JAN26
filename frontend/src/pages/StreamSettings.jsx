import React, { useState, useEffect, useCallback, useRef } from "react";
import { getNewJobInternalTemplateName } from "../utils/newJobInternalTemplate";
import {
  buildSampleProjectForStreamPreview,
  buildSampleProjectPartialDeposit,
  getStreamNewProjectRow,
  resolveNewProjectClientFrom,
  resolveNewProjectClientToEmails,
  resolveNewProjectTeamFrom,
  resolveNewProjectTeamToEmailsFromStream,
} from "../utils/streamNewProjectEmail";
import {
  parseEmailTemplateToAddressList,
  resolveDesignToSalespersonFrom,
  resolveDesignToSalespersonToEmails,
  resolveSalesToDesignFrom,
  resolveSalesToDesignToEmails,
} from "../utils/drawingNotifyFrom";

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

const SECTION_OPTIONS = [
  { key: "newProject", label: "New Project" },
  { key: "drawings", label: "Drawings" },
  { key: "colours", label: "Colours" },
  { key: "general", label: "General" },
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
  { title: "Design to Salesperson" },
  { title: "Sales Person to Client" },
];

function defaultDrawingSectionOpen() {
  const open = { vic: {}, qld: {} };
  for (const s of DRAWING_EMAIL_SECTIONS) {
    open.vic[s.title] = false;
    open.qld[s.title] = false;
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
    qldSalespersonToClientFromEmail: "",
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

export default function StreamSettings() {
  const [selectedStream, setSelectedStream] = useState(STREAM_OPTIONS[0]);
  const [activeSection, setActiveSection] = useState("drawings");
  const [streamSettingsMap, setStreamSettingsMap] = useState(() => normalizeStreamSettingsMap({}));
  const streamSettingsMapRef = useRef(streamSettingsMap);
  streamSettingsMapRef.current = streamSettingsMap;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [smtpSlotEmails, setSmtpSlotEmails] = useState([]);
  const [streamPreviewOpen, setStreamPreviewOpen] = useState(null);
  const [streamPreviewTitle, setStreamPreviewTitle] = useState("");
  const [streamPreviewLinesByRegion, setStreamPreviewLinesByRegion] = useState({ vic: [], qld: [] });
  const [streamPreviewRegion, setStreamPreviewRegion] = useState("vic");
  const [streamPreviewLoading, setStreamPreviewLoading] = useState(false);
  const [streamPreviewError, setStreamPreviewError] = useState("");
  const [newProjectSectionOpen, setNewProjectSectionOpen] = useState(defaultNewProjectSectionOpen);
  const [drawingSectionOpen, setDrawingSectionOpen] = useState(defaultDrawingSectionOpen);
  const streamDisplayList = streamDisplayItems(STREAM_OPTIONS);

  useEffect(() => {
    if (activeSection === "newProject") {
      setNewProjectSectionOpen(defaultNewProjectSectionOpen());
    }
    if (activeSection === "drawings") {
      setDrawingSectionOpen(defaultDrawingSectionOpen());
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
    } catch (e) {
      console.error(e);
      setStreamSettingsMap(normalizeStreamSettingsMap({}));
      setSmtpSlotEmails([]);
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
    } catch (e) {
      console.error(e);
      alert(`Could not save stream settings: ${e.message}`);
      await loadSettings();
    } finally {
      setSaving(false);
    }
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

  function liteTokenProjectText(s, project) {
    if (!s || !project) return "";
    const clientFirst = String(project.client_name || "")
      .trim()
      .split(/\s+/)[0];
    return String(s)
      .replace(/\{ProjectName\}/g, project.name || "")
      .replace(/\{ClientName\}/g, clientFirst || project.client_name || "")
      .replace(/\{Draftsperson\}/g, project.draftsperson || "")
      .replace(/\{Position\}/g, "Draftsperson")
      .replace(/\{Salesperson\}/g, project.salesperson || "");
  }

  function computeNewProjectPreviewLines(settings, templates, streamKey) {
    const sample = buildSampleProjectForStreamPreview(streamKey);
    const samplePartial = buildSampleProjectPartialDeposit(streamKey);
    const rowInfo = getStreamNewProjectRow(settings, sample);
    const lines = [];
    lines.push(`Region: ${/ - QLD$/i.test(streamKey) ? "QLD" : "VIC"} — settings row: ${rowInfo.streamKey || "(none)"}`);
    lines.push(`Sample project.stream: ${streamKey}`);
    lines.push("");

    const intName = getNewJobInternalTemplateName(sample);
    const intTmpl = templates.find((t) => t.name && t.name.toLowerCase().trim() === intName.toLowerCase().trim());
    if (!intTmpl) {
      lines.push(`— NEW JOB (internal) — Template "${intName}" not found.`);
    } else {
      const from = resolveNewProjectTeamFrom(settings, sample);
      const toList = resolveNewProjectTeamToEmailsFromStream(settings, sample);
      lines.push("— NEW JOB (internal) —");
      lines.push(`From: ${from || "(none)"}`);
      lines.push(`To: ${toList.join(", ") || "(none)"}`);
      lines.push(`Subject: ${liteTokenProjectText(intTmpl.subject || "", sample)}`);
      const bodyPlain = liteTokenProjectText(String(intTmpl.body || "").replace(/<[^>]+>/g, " "), sample);
      lines.push(`Body (excerpt): ${bodyPlain.slice(0, 280)}${bodyPlain.length > 280 ? "…" : ""}`);
    }
    lines.push("");

    for (const [heading, proj, tname] of [
      ["— NEW JOB — Client (full deposit) —", sample, "NEW JOB - Client Full Deposit"],
      ["— NEW JOB — Client (partial deposit) —", samplePartial, "NEW JOB - Client Part Deposit"],
    ]) {
      const tmpl = templates.find((t) => t.name && t.name.trim() === tname);
      lines.push(heading);
      if (!tmpl) {
        lines.push(`Template "${tname}" not found.`);
      } else {
        const from = resolveNewProjectClientFrom(settings, proj);
        const toL = resolveNewProjectClientToEmails(settings, proj);
        const toDisp = toL.length > 0 ? toL.join(", ") : "(none)";
        lines.push(`From: ${from || "(none)"}`);
        lines.push(`To: ${toDisp}`);
        lines.push(`Subject: ${liteTokenProjectText(tmpl.subject || "", proj)}`);
        const bodyPlain = liteTokenProjectText(String(tmpl.body || "").replace(/<[^>]+>/g, " "), proj);
        lines.push(`Body (excerpt): ${bodyPlain.slice(0, 280)}${bodyPlain.length > 280 ? "…" : ""}`);
      }
      lines.push("");
    }
    return lines;
  }

  function computeDrawingsPreviewLines(settings, templates, streamKey) {
    const sample = buildSampleProjectForStreamPreview(streamKey);
    const lines = [];
    lines.push(`Region: ${/ - QLD$/i.test(streamKey) ? "QLD" : "VIC"} — sample project.stream: ${streamKey}`);
    lines.push("");

    const d1 = templates.find((t) => t.name === "DRAWINGS - Design to Sales");
    lines.push("— DRAWINGS — Design to Sales —");
    if (!d1) {
      lines.push('Template "DRAWINGS - Design to Sales" not found.');
    } else {
      const tTo = parseEmailTemplateToAddressList(d1.to_addresses);
      const to = resolveDesignToSalespersonToEmails(settings, sample, tTo);
      const from = resolveDesignToSalespersonFrom(settings, sample, "");
      lines.push(`From: ${from || "(none)"}`);
      lines.push(`To: ${to.join(", ") || "(none)"}`);
      lines.push(`Subject: ${liteTokenProjectText(d1.subject || "", sample)}`);
    }
    lines.push("");

    const d2 = templates.find((t) => t.name === "DRAWINGS - Sales to Design");
    lines.push("— DRAWINGS — Sales to Design —");
    if (!d2) {
      lines.push('Template "DRAWINGS - Sales to Design" not found.');
    } else {
      let rawTo = [];
      if (Array.isArray(d2.to_addresses)) rawTo = d2.to_addresses;
      else if (d2.to_addresses) {
        try {
          rawTo = JSON.parse(d2.to_addresses);
        } catch {
          rawTo = String(d2.to_addresses)
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean);
        }
      }
      const to = resolveSalesToDesignToEmails(settings, sample, rawTo);
      const from = resolveSalesToDesignFrom(settings, sample, "");
      lines.push(`From: ${from || "(none)"}`);
      lines.push(`To: ${to.join(", ") || "(none)"}`);
      lines.push(`Subject: ${liteTokenProjectText(d2.subject || "", sample)}`);
    }
    return lines;
  }

  async function runStreamPreviewNewProject() {
    setStreamPreviewLoading(true);
    setStreamPreviewError("");
    setStreamPreviewTitle("New project — email preview");
    setStreamPreviewOpen("newProject");
    setStreamPreviewLinesByRegion({ vic: [], qld: [] });
    try {
      const [templatesRes, settingsRes] = await Promise.all([
        fetch(`${API_URL}/api/email-templates`),
        fetch(`${API_URL}/api/settings`),
      ]);
      if (!templatesRes.ok) throw new Error("Could not load email templates");
      const templates = await templatesRes.json();
      const settings = settingsRes.ok ? await settingsRes.json() : {};
      const { vicKey, qldKey } = resolveVicQldStreamKeys(selectedStream);
      setStreamPreviewLinesByRegion({
        vic: computeNewProjectPreviewLines(settings, templates, vicKey),
        qld: computeNewProjectPreviewLines(settings, templates, qldKey),
      });
      setStreamPreviewRegion(/ - QLD$/i.test(selectedStream) ? "qld" : "vic");
    } catch (e) {
      setStreamPreviewError(e.message || String(e));
    } finally {
      setStreamPreviewLoading(false);
    }
  }

  async function runStreamPreviewDrawings() {
    setStreamPreviewLoading(true);
    setStreamPreviewError("");
    setStreamPreviewTitle("Drawings — email preview");
    setStreamPreviewOpen("drawings");
    setStreamPreviewLinesByRegion({ vic: [], qld: [] });
    try {
      const [templatesRes, settingsRes] = await Promise.all([
        fetch(`${API_URL}/api/email-templates`),
        fetch(`${API_URL}/api/settings`),
      ]);
      if (!templatesRes.ok) throw new Error("Could not load email templates");
      const templates = await templatesRes.json();
      const settings = settingsRes.ok ? await settingsRes.json() : {};
      const { vicKey, qldKey } = resolveVicQldStreamKeys(selectedStream);
      setStreamPreviewLinesByRegion({
        vic: computeDrawingsPreviewLines(settings, templates, vicKey),
        qld: computeDrawingsPreviewLines(settings, templates, qldKey),
      });
      setStreamPreviewRegion(/ - QLD$/i.test(selectedStream) ? "qld" : "vic");
    } catch (e) {
      setStreamPreviewError(e.message || String(e));
    } finally {
      setStreamPreviewLoading(false);
    }
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
          Current Streams ({streamDisplayList.length})
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {streamDisplayList.map(({ label, keys }) => {
            const isSelected = keys.includes(selectedStream);
            const onPick = () => setSelectedStream(isSelected ? selectedStream : keys[0]);
            return (
            <button
              key={label}
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
        {SECTION_OPTIONS.map((section) => {
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
        <h3 style={{ margin: "0 0 12px 0", fontSize: "1.05rem", fontWeight: 700 }}>{selectedStreamLabel}</h3>

        {loading ? (
          <div style={{ fontSize: "0.95rem", color: "#32323399" }}>Loading stream settings…</div>
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
                              <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "2px" }}>
                                <button
                                  type="button"
                                  disabled={saving || streamPreviewLoading}
                                  onClick={() => void runStreamPreviewNewProject()}
                                  style={{
                                    flexShrink: 0,
                                    backgroundColor: "#6f42c1",
                                    color: WHITE,
                                    border: "none",
                                    borderRadius: "10px",
                                    padding: "6px 10px",
                                    fontSize: "0.78rem",
                                    fontWeight: 600,
                                    cursor: saving || streamPreviewLoading ? "wait" : "pointer",
                                  }}
                                >
                                  Preview emails
                                </button>
                              </div>
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
                    Drawings
                  </h4>
                  <button
                    type="button"
                    disabled={saving || streamPreviewLoading}
                    onClick={() => void runStreamPreviewDrawings()}
                    style={{
                      flexShrink: 0,
                      backgroundColor: "#6f42c1",
                      color: WHITE,
                      border: "none",
                      borderRadius: "10px",
                      padding: "8px 14px",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      cursor: saving || streamPreviewLoading ? "wait" : "pointer",
                    }}
                  >
                    Preview emails
                  </button>
                </div>
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
                            const sectionExpanded = !!drawingSectionOpen[columnKey]?.[section.title];
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
                                      setDrawingSectionOpen((prev) => {
                                        const currentlyOpen = !!prev[columnKey]?.[section.title];
                                        const nextColumnState = {};
                                        for (const s of DRAWING_EMAIL_SECTIONS) {
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
                                    {section.title === "Design to Salesperson" ? (
                                      <>
                                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                          <span style={{ fontSize: "0.78rem", fontWeight: 600, color: `${MONUMENT}b3` }}>
                                            Design to Salesperson — From
                                          </span>
                                          <DrawingNotifySmtpSelect
                                            smtpOptions={smtpSlotEmails}
                                            value={
                                              isQld
                                                ? d.qldDesignToSalespersonFromEmail || ""
                                                : d.designToSalespersonFromEmail || ""
                                            }
                                            disabled={saving}
                                            onValueChange={(next) => {
                                              updateDrawingText(
                                                rowKey,
                                                isQld ? "qldDesignToSalespersonFromEmail" : "designToSalespersonFromEmail",
                                                next
                                              );
                                            }}
                                            onCommit={flushPersist}
                                          />
                                        </div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                          <span style={{ fontSize: "0.78rem", fontWeight: 600, color: `${MONUMENT}b3` }}>
                                            Design to Salesperson — To
                                          </span>
                                          <DrawingNotifySmtpSelect
                                            smtpOptions={smtpSlotEmails}
                                            value={
                                              isQld
                                                ? d.qldDesignToSalespersonToEmail || ""
                                                : d.designToSalespersonToEmail || ""
                                            }
                                            disabled={saving}
                                            onValueChange={(next) => {
                                              updateDrawingText(
                                                rowKey,
                                                isQld ? "qldDesignToSalespersonToEmail" : "designToSalespersonToEmail",
                                                next
                                              );
                                            }}
                                            onCommit={flushPersist}
                                          />
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                          <span style={{ fontSize: "0.78rem", fontWeight: 600, color: `${MONUMENT}b3` }}>
                                            Sales Person to Client — From
                                          </span>
                                          <DrawingNotifySmtpSelect
                                            smtpOptions={smtpSlotEmails}
                                            value={
                                              isQld
                                                ? d.qldSalespersonToClientFromEmail || ""
                                                : d.salespersonToClientFromEmail || ""
                                            }
                                            disabled={saving}
                                            onValueChange={(next) => {
                                              updateDrawingText(
                                                rowKey,
                                                isQld ? "qldSalespersonToClientFromEmail" : "salespersonToClientFromEmail",
                                                next
                                              );
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
                                            checked={isQld ? !!d.qldSendToClients : !!d.sendToClients}
                                            disabled={saving}
                                            onChange={() =>
                                              toggleDrawingOption(rowKey, isQld ? "qldSendToClients" : "sendToClients")
                                            }
                                            style={{ width: "18px", height: "18px", cursor: saving ? "wait" : "pointer" }}
                                          />
                                          Send to Clients
                                        </label>
                                        {EXTRA_EMAIL_SLOTS.map(({ checkKey, addrKey, label }) => {
                                          const qldCheckKey = `qld${checkKey.charAt(0).toUpperCase()}${checkKey.slice(1)}`;
                                          const qldAddrKey = `qld${addrKey.charAt(0).toUpperCase()}${addrKey.slice(1)}`;
                                          const useCheckKey = isQld ? qldCheckKey : checkKey;
                                          const useAddrKey = isQld ? qldAddrKey : addrKey;
                                          return (
                                            <div key={`${colTitle}-${checkKey}`} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
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
                                    )}
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

            {activeSection === "colours" ? (
              <div style={{ ...columnPanelStyle, minHeight: "100%" }}>
                <h4 style={columnTitleStyle}>Colours</h4>
                <p style={{ margin: 0, fontSize: "0.88rem", color: "#32323399", lineHeight: 1.45 }}>
                  Options for this stream will go here.
                </p>
              </div>
            ) : null}

            {activeSection === "general" ? (
              <div style={{ ...columnPanelStyle, minHeight: "100%" }}>
                <h4 style={columnTitleStyle}>General</h4>
                <p style={{ margin: 0, fontSize: "0.88rem", color: "#32323399", lineHeight: 1.45 }}>
                  General options for this stream will go here.
                </p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
    {streamPreviewOpen ? (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={streamPreviewTitle}
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.45)",
          zIndex: 6000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
          boxSizing: "border-box",
        }}
        onClick={() => setStreamPreviewOpen(null)}
      >
        <div
          style={{
            background: WHITE,
            borderRadius: "12px",
            maxWidth: "640px",
            width: "100%",
            maxHeight: "85vh",
            overflow: "auto",
            padding: "20px",
            boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
            color: MONUMENT,
            boxSizing: "border-box",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>{streamPreviewTitle}</h3>
            <button
              type="button"
              onClick={() => setStreamPreviewOpen(null)}
              style={{
                background: "transparent",
                border: "none",
                fontSize: "1.4rem",
                lineHeight: 1,
                cursor: "pointer",
                color: MONUMENT,
                padding: "0 4px",
              }}
            >
              ×
            </button>
          </div>
          <p style={{ margin: "10px 0 12px", fontSize: "0.82rem", color: "#323233aa", lineHeight: 1.45 }}>
            Sample projects for the VIC and QLD stream rows only. From/To come from Stream Settings → Drawings on those
            rows (not from global settings or email templates). Use VIC / QLD to switch previews.
          </p>
          {streamPreviewLoading ? (
            <div style={{ fontSize: "0.92rem" }}>Loading…</div>
          ) : null}
          {streamPreviewError ? (
            <div style={{ fontSize: "0.92rem", color: "#b00020", marginBottom: "10px" }}>{streamPreviewError}</div>
          ) : null}
          {!streamPreviewLoading && !streamPreviewError ? (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: `${MONUMENT}b3` }}>Show:</span>
              {["vic", "qld"].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setStreamPreviewRegion(r)}
                  style={{
                    padding: "7px 14px",
                    borderRadius: "8px",
                    border: `2px solid ${streamPreviewRegion === r ? "#6f42c1" : `${MONUMENT}33`}`,
                    background: streamPreviewRegion === r ? "#ede7f6" : WHITE,
                    color: MONUMENT,
                    fontWeight: streamPreviewRegion === r ? 700 : 500,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
          ) : null}
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              fontFamily: "system-ui, sans-serif",
              fontSize: "0.84rem",
              lineHeight: 1.5,
            }}
          >
            {(streamPreviewLinesByRegion[streamPreviewRegion] || []).join("\n")}
          </pre>
        </div>
      </div>
    ) : null}
    </>
  );
}
