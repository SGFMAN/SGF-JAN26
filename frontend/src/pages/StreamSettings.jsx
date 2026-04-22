import React, { useState, useEffect, useCallback, useRef } from "react";

const MONUMENT = "#323233";
const WHITE = "#fff";
const API_URL = "";

const STREAM_OPTIONS = [
  "SGF - VIC",
  "SGF - QLD",
  "Dual Dwelling",
  "ATA",
  "Pumped on Property",
  "Henderson",
  "Creat Cash Flow",
  "Fresh Start Advisory",
];

const EXTRA_EMAIL_SLOTS = [
  { checkKey: "extraEmail1", addrKey: "extraEmail1Address", label: "Extra Email 1" },
  { checkKey: "extraEmail2", addrKey: "extraEmail2Address", label: "Extra Email 2" },
  { checkKey: "extraEmail3", addrKey: "extraEmail3Address", label: "Extra Email 3" },
];

function defaultDrawingsState() {
  return {
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
    const row = src[stream] && typeof src[stream] === "object" ? { ...src[stream] } : {};
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

export default function StreamSettings() {
  const [selectedStream, setSelectedStream] = useState(STREAM_OPTIONS[0]);
  const [streamSettingsMap, setStreamSettingsMap] = useState(() => normalizeStreamSettingsMap({}));
  const streamSettingsMapRef = useRef(streamSettingsMap);
  streamSettingsMapRef.current = streamSettingsMap;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/settings`);
      if (!res.ok) throw new Error("Failed to load settings");
      const data = await res.json();
      setStreamSettingsMap(normalizeStreamSettingsMap(data.stream_settings_json));
    } catch (e) {
      console.error(e);
      setStreamSettingsMap(normalizeStreamSettingsMap({}));
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

  const drawingsForStream = streamSettingsMap[selectedStream]?.drawings || defaultDrawingsState();

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
