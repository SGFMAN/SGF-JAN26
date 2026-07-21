import React, { useCallback, useEffect, useState } from "react";
import { fetchStreams } from "../utils/streamsCatalog";
import { UI } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const API_URL = "";

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "8px",
  border: `1px solid ${MONUMENT}33`,
  fontSize: "0.95rem",
  color: MONUMENT,
  background: WHITE,
  boxSizing: "border-box",
};

export default function StreamsSettings() {
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newAcronym, setNewAcronym] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const rows = await fetchStreams(API_URL);
      setStreams(rows);
    } catch (e) {
      setError(e.message || "Failed to load streams");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(e) {
    e?.preventDefault?.();
    const name = newName.trim();
    if (!name) {
      alert("Enter a stream name (this is stored on projects).");
      return;
    }
    try {
      setSaving(true);
      setError("");
      const res = await fetch(`${API_URL}/api/streams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          display_name: newDisplayName.trim() || name,
          badge_acronym: newAcronym.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setNewName("");
      setNewDisplayName("");
      setNewAcronym("");
      await load();
    } catch (err) {
      setError(err.message || "Failed to add stream");
      alert(err.message || "Failed to add stream");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(stream) {
    if (stream.is_sgf) return;
    if (!window.confirm(`Remove stream "${stream.display_name || stream.name}"? Existing projects keep their stream value.`)) {
      return;
    }
    try {
      setSaving(true);
      const res = await fetch(`${API_URL}/api/streams/${stream.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      await load();
    } catch (err) {
      alert(err.message || "Failed to remove stream");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: "8px 4px", maxWidth: "720px" }}>
      <h2 style={{ margin: "0 0 8px", fontSize: "1.35rem", color: MONUMENT }}>Streams</h2>
      <p style={{ margin: "0 0 20px", color: UI.textMuted, fontSize: "0.92rem", lineHeight: 1.45 }}>
        Streams appear on new projects, Hotlist, sales pages, and Email Settings. Adding a stream creates
        empty VIC / QLD email setting rows automatically.
      </p>

      {loading ? (
        <div style={{ color: UI.textMuted }}>Loading…</div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            marginBottom: "28px",
          }}
        >
          {streams.map((s) => (
            <div
              key={s.id ?? s.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 14px",
                background: WHITE,
                borderRadius: "10px",
                border: `1px solid ${MONUMENT}22`,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: MONUMENT }}>{s.display_name || s.name}</div>
                <div style={{ fontSize: "0.82rem", color: UI.textMuted, marginTop: "2px" }}>
                  Project value: {s.name}
                  {s.badge_acronym ? ` · Badge: ${s.badge_acronym}` : ""}
                  {s.is_sgf ? " · Always shown on sales" : ""}
                </div>
              </div>
              {!s.is_sgf && typeof s.id === "number" && s.id > 0 ? (
                <button
                  type="button"
                  onClick={() => handleDelete(s)}
                  disabled={saving}
                  style={{
                    padding: "7px 12px",
                    borderRadius: "8px",
                    border: `1px solid ${MONUMENT}33`,
                    background: "transparent",
                    color: MONUMENT,
                    fontWeight: 600,
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {error ? (
        <div style={{ marginBottom: "12px", color: "#842029", fontSize: "0.9rem" }}>{error}</div>
      ) : null}

      <form
        onSubmit={handleAdd}
        style={{
          padding: "16px",
          background: WHITE,
          borderRadius: "10px",
          border: `1px solid ${MONUMENT}22`,
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <div style={{ fontWeight: 700, color: MONUMENT }}>Add stream</div>
        <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.88rem" }}>
          Name (stored on projects)
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Coastal Living"
            style={inputStyle}
            disabled={saving}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.88rem" }}>
          Display name (Email Settings / lists)
          <input
            value={newDisplayName}
            onChange={(e) => setNewDisplayName(e.target.value)}
            placeholder="Defaults to name"
            style={inputStyle}
            disabled={saving}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.88rem" }}>
          Badge acronym (optional)
          <input
            value={newAcronym}
            onChange={(e) => setNewAcronym(e.target.value)}
            placeholder="e.g. CL"
            maxLength={8}
            style={inputStyle}
            disabled={saving}
          />
        </label>
        <button
          type="submit"
          disabled={saving || !newName.trim()}
          style={{
            alignSelf: "flex-start",
            padding: "10px 16px",
            borderRadius: "8px",
            border: "none",
            background: MONUMENT,
            color: WHITE,
            fontWeight: 600,
            cursor: saving || !newName.trim() ? "not-allowed" : "pointer",
            opacity: saving || !newName.trim() ? 0.65 : 1,
          }}
        >
          {saving ? "Saving…" : "Add stream"}
        </button>
      </form>
    </div>
  );
}
