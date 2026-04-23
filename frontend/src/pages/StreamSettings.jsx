import React, { useState, useEffect, useCallback, useRef } from "react";

const MONUMENT = "#323233";
const WHITE = "#fff";
const API_URL = "";

/** Top-level settings (not in stream_settings_json) — shown in Drawings for SGF - VIC / SGF - QLD */
const DRAWING_NOTIFY_KEYS = {
  vicDesignToSales: "drawings_vic_design_to_salesperson_email",
  vicDesignToSalesTo: "drawings_vic_design_to_salesperson_to_email",
  vicSalesToClient: "drawings_vic_salesperson_to_client_email",
  qldDesignToSales: "drawings_qld_design_to_salesperson_email",
  qldDesignToSalesTo: "drawings_qld_design_to_salesperson_to_email",
  qldSalesToClient: "drawings_qld_salesperson_to_client_email",
};

const GLOBAL_DRAWING_SAVE_MS = 550;

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
    out[stream] = row;
  }
  return out;
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
  const [streamSettingsMap, setStreamSettingsMap] = useState(() => normalizeStreamSettingsMap({}));
  const streamSettingsMapRef = useRef(streamSettingsMap);
  streamSettingsMapRef.current = streamSettingsMap;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [vicDesignToSales, setVicDesignToSales] = useState("");
  const [vicDesignToSalesTo, setVicDesignToSalesTo] = useState("");
  const [vicSalesToClient, setVicSalesToClient] = useState("");
  const [qldDesignToSales, setQldDesignToSales] = useState("");
  const [qldDesignToSalesTo, setQldDesignToSalesTo] = useState("");
  const [qldSalesToClient, setQldSalesToClient] = useState("");
  const [smtpSlotEmails, setSmtpSlotEmails] = useState([]);
  const globalDrawingEmailsRef = useRef({
    vicDesignToSales: "",
    vicDesignToSalesTo: "",
    vicSalesToClient: "",
    qldDesignToSales: "",
    qldDesignToSalesTo: "",
    qldSalesToClient: "",
  });
  const globalDrawingSaveTimerRef = useRef(null);

  /** Keep ref in sync immediately — select onBlur can run same turn as onChange before React effects run. */
  function patchGlobalDrawingEmailsRef(patch) {
    globalDrawingEmailsRef.current = { ...globalDrawingEmailsRef.current, ...patch };
  }

  function applyGlobalDrawingEmailsFromApi(data) {
    if (!data || typeof data !== "object") return;
    const next = {
      vicDesignToSales: data[DRAWING_NOTIFY_KEYS.vicDesignToSales] || "",
      vicDesignToSalesTo: data[DRAWING_NOTIFY_KEYS.vicDesignToSalesTo] || "",
      vicSalesToClient: data[DRAWING_NOTIFY_KEYS.vicSalesToClient] || "",
      qldDesignToSales: data[DRAWING_NOTIFY_KEYS.qldDesignToSales] || "",
      qldDesignToSalesTo: data[DRAWING_NOTIFY_KEYS.qldDesignToSalesTo] || "",
      qldSalesToClient: data[DRAWING_NOTIFY_KEYS.qldSalesToClient] || "",
    };
    globalDrawingEmailsRef.current = next;
    setVicDesignToSales(next.vicDesignToSales);
    setVicDesignToSalesTo(next.vicDesignToSalesTo);
    setVicSalesToClient(next.vicSalesToClient);
    setQldDesignToSales(next.qldDesignToSales);
    setQldDesignToSalesTo(next.qldDesignToSalesTo);
    setQldSalesToClient(next.qldSalesToClient);
  }

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/settings`);
      if (!res.ok) throw new Error("Failed to load settings");
      const data = await res.json();
      setStreamSettingsMap(normalizeStreamSettingsMap(data.stream_settings_json));
      applyGlobalDrawingEmailsFromApi(data);
      setSmtpSlotEmails(smtpSlotEmailsFromSettings(data));
    } catch (e) {
      console.error(e);
      setStreamSettingsMap(normalizeStreamSettingsMap({}));
      applyGlobalDrawingEmailsFromApi({});
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
        body: JSON.stringify({ stream_settings_json: nextMap }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || res.statusText);
      }
      const data = await res.json();
      setStreamSettingsMap(normalizeStreamSettingsMap(data.stream_settings_json));
      applyGlobalDrawingEmailsFromApi(data);
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

  function flushPersist() {
    void persistStreamSettings(normalizeStreamSettingsMap(streamSettingsMapRef.current));
  }

  function globalDrawingPayload() {
    const g = globalDrawingEmailsRef.current;
    const trim = (s) => (s == null ? "" : String(s).trim());
    return {
      [DRAWING_NOTIFY_KEYS.vicDesignToSales]: trim(g.vicDesignToSales) || null,
      [DRAWING_NOTIFY_KEYS.vicDesignToSalesTo]: trim(g.vicDesignToSalesTo) || null,
      [DRAWING_NOTIFY_KEYS.vicSalesToClient]: trim(g.vicSalesToClient) || null,
      [DRAWING_NOTIFY_KEYS.qldDesignToSales]: trim(g.qldDesignToSales) || null,
      [DRAWING_NOTIFY_KEYS.qldDesignToSalesTo]: trim(g.qldDesignToSalesTo) || null,
      [DRAWING_NOTIFY_KEYS.qldSalesToClient]: trim(g.qldSalesToClient) || null,
    };
  }

  async function persistGlobalDrawingEmails() {
    try {
      setSaving(true);
      const res = await fetch(`${API_URL}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(globalDrawingPayload()),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || res.statusText);
      }
      const data = await res.json();
      setStreamSettingsMap(normalizeStreamSettingsMap(data.stream_settings_json));
      applyGlobalDrawingEmailsFromApi(data);
      setSmtpSlotEmails(smtpSlotEmailsFromSettings(data));
    } catch (e) {
      console.error(e);
      alert(`Could not save drawing emails: ${e.message}`);
      await loadSettings();
    } finally {
      setSaving(false);
    }
  }

  function scheduleGlobalDrawingSave() {
    if (globalDrawingSaveTimerRef.current) clearTimeout(globalDrawingSaveTimerRef.current);
    globalDrawingSaveTimerRef.current = setTimeout(() => {
      globalDrawingSaveTimerRef.current = null;
      void persistGlobalDrawingEmails();
    }, GLOBAL_DRAWING_SAVE_MS);
  }

  function flushGlobalDrawingSave() {
    if (globalDrawingSaveTimerRef.current) {
      clearTimeout(globalDrawingSaveTimerRef.current);
      globalDrawingSaveTimerRef.current = null;
    }
    void persistGlobalDrawingEmails();
  }

  useEffect(() => {
    return () => {
      if (globalDrawingSaveTimerRef.current) clearTimeout(globalDrawingSaveTimerRef.current);
    };
  }, []);

  const drawingsForStream = streamSettingsMap[selectedStream]?.drawings || defaultDrawingsState();
  const isSgfStream = selectedStream === "SGF - VIC" || selectedStream === "SGF - QLD";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "flex-start",
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
          Current Streams ({STREAM_OPTIONS.length})
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {STREAM_OPTIONS.map((stream) => (
            <button
              key={stream}
              onClick={() => setSelectedStream(stream)}
              style={{
                width: "fit-content",
                minWidth: "100%",
                background: selectedStream === stream ? WHITE : "transparent",
                color: selectedStream === stream ? MONUMENT : "#404049",
                border: "none",
                borderRadius: "10px",
                padding: "10px 8px",
                fontSize: "0.95rem",
                fontWeight: 500,
                textAlign: "center",
                letterSpacing: "0.3px",
                cursor: "pointer",
                transition: "background 0.18s, color 0.15s",
                outline: selectedStream === stream ? `2px solid ${MONUMENT}` : "none",
                boxShadow: selectedStream === stream ? "0 2px 4px rgba(50,50,51,.04)" : "none",
              }}
            >
              {stream}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          flex: 1,
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
        <h3 style={{ margin: "0 0 12px 0", fontSize: "1.05rem", fontWeight: 700 }}>{selectedStream}</h3>

        {loading ? (
          <div style={{ fontSize: "0.95rem", color: "#32323399" }}>Loading stream settings…</div>
        ) : (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "12px",
              alignContent: "stretch",
            }}
          >
            <div style={columnPanelStyle}>
              <h4 style={columnTitleStyle}>Drawings</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {selectedStream === "SGF - VIC" ? (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span style={{ fontSize: "0.78rem", fontWeight: 600, color: `${MONUMENT}b3` }}>
                        Design to Salesperson — From
                      </span>
                      <DrawingNotifySmtpSelect
                        smtpOptions={smtpSlotEmails}
                        value={vicDesignToSales}
                        disabled={saving}
                        onValueChange={(next) => {
                          patchGlobalDrawingEmailsRef({ vicDesignToSales: next });
                          setVicDesignToSales(next);
                          scheduleGlobalDrawingSave();
                        }}
                        onCommit={flushGlobalDrawingSave}
                      />
                      <span style={{ fontSize: "0.78rem", fontWeight: 600, color: `${MONUMENT}b3` }}>
                        Design to Salesperson — To
                      </span>
                      <DrawingNotifySmtpSelect
                        smtpOptions={smtpSlotEmails}
                        value={vicDesignToSalesTo}
                        disabled={saving}
                        onValueChange={(next) => {
                          patchGlobalDrawingEmailsRef({ vicDesignToSalesTo: next });
                          setVicDesignToSalesTo(next);
                          scheduleGlobalDrawingSave();
                        }}
                        onCommit={flushGlobalDrawingSave}
                      />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span style={{ fontSize: "0.78rem", fontWeight: 600, color: `${MONUMENT}b3` }}>
                        Sales Person to Client — From
                      </span>
                      <DrawingNotifySmtpSelect
                        smtpOptions={smtpSlotEmails}
                        value={vicSalesToClient}
                        disabled={saving}
                        onValueChange={(next) => {
                          patchGlobalDrawingEmailsRef({ vicSalesToClient: next });
                          setVicSalesToClient(next);
                          scheduleGlobalDrawingSave();
                        }}
                        onCommit={flushGlobalDrawingSave}
                      />
                    </div>
                    <div
                      style={{
                        margin: "4px 0 0 0",
                        borderTop: `1px solid ${MONUMENT}18`,
                        paddingTop: "10px",
                      }}
                    />
                  </>
                ) : null}

                {selectedStream === "SGF - QLD" ? (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span style={{ fontSize: "0.78rem", fontWeight: 600, color: `${MONUMENT}b3` }}>
                        Design to Salesperson — From
                      </span>
                      <DrawingNotifySmtpSelect
                        smtpOptions={smtpSlotEmails}
                        value={qldDesignToSales}
                        disabled={saving}
                        onValueChange={(next) => {
                          patchGlobalDrawingEmailsRef({ qldDesignToSales: next });
                          setQldDesignToSales(next);
                          scheduleGlobalDrawingSave();
                        }}
                        onCommit={flushGlobalDrawingSave}
                      />
                      <span style={{ fontSize: "0.78rem", fontWeight: 600, color: `${MONUMENT}b3` }}>
                        Design to Salesperson — To
                      </span>
                      <DrawingNotifySmtpSelect
                        smtpOptions={smtpSlotEmails}
                        value={qldDesignToSalesTo}
                        disabled={saving}
                        onValueChange={(next) => {
                          patchGlobalDrawingEmailsRef({ qldDesignToSalesTo: next });
                          setQldDesignToSalesTo(next);
                          scheduleGlobalDrawingSave();
                        }}
                        onCommit={flushGlobalDrawingSave}
                      />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span style={{ fontSize: "0.78rem", fontWeight: 600, color: `${MONUMENT}b3` }}>
                        Sales Person to Client — From
                      </span>
                      <DrawingNotifySmtpSelect
                        smtpOptions={smtpSlotEmails}
                        value={qldSalesToClient}
                        disabled={saving}
                        onValueChange={(next) => {
                          patchGlobalDrawingEmailsRef({ qldSalesToClient: next });
                          setQldSalesToClient(next);
                          scheduleGlobalDrawingSave();
                        }}
                        onCommit={flushGlobalDrawingSave}
                      />
                    </div>
                    <div
                      style={{
                        margin: "4px 0 0 0",
                        borderTop: `1px solid ${MONUMENT}18`,
                        paddingTop: "10px",
                      }}
                    />
                  </>
                ) : null}

                {!isSgfStream ? (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span style={{ fontSize: "0.78rem", fontWeight: 600, color: `${MONUMENT}b3` }}>
                        Design to Salesperson — From
                      </span>
                      <DrawingNotifySmtpSelect
                        smtpOptions={smtpSlotEmails}
                        value={drawingsForStream.designToSalespersonFromEmail || ""}
                        disabled={saving}
                        onValueChange={(next) => {
                          updateDrawingText(selectedStream, "designToSalespersonFromEmail", next);
                        }}
                        onCommit={flushPersist}
                      />
                      <span style={{ fontSize: "0.78rem", fontWeight: 600, color: `${MONUMENT}b3` }}>
                        Design to Salesperson — To
                      </span>
                      <DrawingNotifySmtpSelect
                        smtpOptions={smtpSlotEmails}
                        value={drawingsForStream.designToSalespersonToEmail || ""}
                        disabled={saving}
                        onValueChange={(next) => {
                          updateDrawingText(selectedStream, "designToSalespersonToEmail", next);
                        }}
                        onCommit={flushPersist}
                      />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span style={{ fontSize: "0.78rem", fontWeight: 600, color: `${MONUMENT}b3` }}>
                        Sales Person to Client — From
                      </span>
                      <DrawingNotifySmtpSelect
                        smtpOptions={smtpSlotEmails}
                        value={drawingsForStream.salespersonToClientFromEmail || ""}
                        disabled={saving}
                        onValueChange={(next) => {
                          updateDrawingText(selectedStream, "salespersonToClientFromEmail", next);
                        }}
                        onCommit={flushPersist}
                      />
                    </div>
                    <div
                      style={{
                        margin: "4px 0 0 0",
                        borderTop: `1px solid ${MONUMENT}18`,
                        paddingTop: "10px",
                      }}
                    />
                  </>
                ) : null}

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
                    checked={!!drawingsForStream.sendToClients}
                    disabled={saving}
                    onChange={() => toggleDrawingOption(selectedStream, "sendToClients")}
                    style={{ width: "18px", height: "18px", cursor: saving ? "wait" : "pointer" }}
                  />
                  Send to Clients
                </label>

                {EXTRA_EMAIL_SLOTS.map(({ checkKey, addrKey, label }) => (
                  <div key={checkKey} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
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
                        checked={!!drawingsForStream[checkKey]}
                        disabled={saving}
                        onChange={() => toggleDrawingOption(selectedStream, checkKey)}
                        style={{ width: "18px", height: "18px", cursor: saving ? "wait" : "pointer" }}
                      />
                      {label}
                    </label>
                    <input
                      type="email"
                      autoComplete="off"
                      placeholder="email@example.com"
                      value={drawingsForStream[addrKey] || ""}
                      disabled={saving}
                      onChange={(e) => updateDrawingText(selectedStream, addrKey, e.target.value)}
                      onBlur={() => flushPersist()}
                      style={inputStyle}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div style={columnPanelStyle}>
              <h4 style={columnTitleStyle}>Colours</h4>
              <p style={{ margin: 0, fontSize: "0.88rem", color: "#32323399", lineHeight: 1.45 }}>Options for this stream will go here.</p>
            </div>

            <div style={columnPanelStyle}>
              <h4 style={columnTitleStyle}>General</h4>
              <p style={{ margin: 0, fontSize: "0.88rem", color: "#32323399", lineHeight: 1.45 }}>General options for this stream will go here.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
