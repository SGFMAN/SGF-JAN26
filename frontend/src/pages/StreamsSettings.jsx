import React, { useCallback, useEffect, useMemo, useState } from "react";
import { fetchStreams } from "../utils/streamsCatalog";
import { getStreamColorGroup, getStreamGroupColors, streamColorHover } from "../utils/streamColors";
import { buildSavedButtonStyle } from "../utils/uiButtonStyles.js";
import { MENU, UI } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const API_URL = "";
const ADD_STREAM_BUTTON_ID = 2;
const STREAMS_PER_COLUMN = 3;
const STREAM_COLUMN_COUNT = 4;

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

const inputDisabledStyle = {
  ...inputStyle,
  background: `${MONUMENT}0d`,
  color: UI.textMuted,
  cursor: "not-allowed",
};

function emptyEditForm() {
  return { name: "", display_name: "", badge_acronym: "" };
}

function formFromStream(stream) {
  if (!stream) return emptyEditForm();
  return {
    name: stream.name || "",
    display_name: stream.display_name || stream.name || "",
    badge_acronym: stream.badge_acronym || "",
  };
}

function streamCardColors(stream) {
  const colors = getStreamGroupColors(getStreamColorGroup(stream?.name));
  return {
    darker: colors.darker,
    lighter: colors.lighter,
  };
}

/** Fill column 1 top→bottom (3), then column 2, etc. Extras stay in the last column. */
function distributeStreamsToColumns(streams, columnCount = STREAM_COLUMN_COUNT, perColumn = STREAMS_PER_COLUMN) {
  const cols = Array.from({ length: columnCount }, () => []);
  for (let i = 0; i < streams.length; i++) {
    const col = Math.min(Math.floor(i / perColumn), columnCount - 1);
    cols[col].push(streams[i]);
  }
  return cols;
}

function mergeButtonStyle(styleId, fallback) {
  const saved = buildSavedButtonStyle(styleId, true);
  return saved ? { ...saved } : fallback;
}

export default function StreamsSettings() {
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newAcronym, setNewAcronym] = useState("");

  const [editingStream, setEditingStream] = useState(null);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [, setUiButtonStyleRevision] = useState(0);

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

  useEffect(() => {
    const refresh = () => setUiButtonStyleRevision((n) => n + 1);
    window.addEventListener("sgf-ui-button-styles-change", refresh);
    return () => window.removeEventListener("sgf-ui-button-styles-change", refresh);
  }, []);

  const streamColumns = useMemo(() => distributeStreamsToColumns(streams), [streams]);

  function openEdit(stream) {
    setEditingStream(stream);
    setEditForm(formFromStream(stream));
  }

  function closeEdit() {
    if (saving) return;
    setEditingStream(null);
    setEditForm(emptyEditForm());
  }

  function openAddModal() {
    setNewName("");
    setNewDisplayName("");
    setNewAcronym("");
    setShowAddModal(true);
  }

  function closeAddModal() {
    if (saving) return;
    setShowAddModal(false);
  }

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
      setShowAddModal(false);
      await load();
    } catch (err) {
      setError(err.message || "Failed to add stream");
      alert(err.message || "Failed to add stream");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(e) {
    e?.preventDefault?.();
    if (!editingStream || typeof editingStream.id !== "number" || editingStream.id <= 0) {
      alert("This stream cannot be edited until it is saved in the database. Restart the backend and try again.");
      return;
    }
    const name = editForm.name.trim();
    if (!editingStream.is_sgf && !name) {
      alert("Enter a stream name (this is stored on projects).");
      return;
    }
    try {
      setSaving(true);
      const res = await fetch(`${API_URL}/api/streams/${editingStream.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingStream.is_sgf ? editingStream.name : name,
          display_name: editForm.display_name.trim() || name || editingStream.name,
          badge_acronym: editForm.badge_acronym.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setEditingStream(null);
      setEditForm(emptyEditForm());
      await load();
    } catch (err) {
      alert(err.message || "Failed to save stream");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteFromModal() {
    if (!editingStream || editingStream.is_sgf) return;
    if (typeof editingStream.id !== "number" || editingStream.id <= 0) return;
    if (
      !window.confirm(
        `Delete stream "${editingStream.display_name || editingStream.name}"? Existing projects keep their stream value.`
      )
    ) {
      return;
    }
    try {
      setSaving(true);
      const res = await fetch(`${API_URL}/api/streams/${editingStream.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setEditingStream(null);
      setEditForm(emptyEditForm());
      await load();
    } catch (err) {
      alert(err.message || "Failed to delete stream");
    } finally {
      setSaving(false);
    }
  }

  const editColors = editingStream ? streamCardColors(editingStream) : null;
  const addStreamFallbackStyle = {
    background: MENU.purple,
    color: MENU.activeText,
    border: `1px solid ${UI.outline}`,
    borderRadius: "8px",
    padding: "10px 20px",
    fontSize: "1rem",
    fontWeight: 500,
    cursor: "pointer",
    transition: "background 0.2s",
    flexShrink: 0,
    minWidth: "100px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  };
  const addStreamButtonStyle = mergeButtonStyle(ADD_STREAM_BUTTON_ID, addStreamFallbackStyle);
  const addStreamUsesSavedStyle = Boolean(buildSavedButtonStyle(ADD_STREAM_BUTTON_ID, true));

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        boxSizing: "border-box",
        padding: "24px 28px",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <h2 style={{ margin: "0 0 8px", fontSize: "1.35rem", color: MONUMENT, flexShrink: 0 }}>Streams</h2>
      <p style={{ margin: "0 0 20px", color: UI.textMuted, fontSize: "0.92rem", lineHeight: 1.45, flexShrink: 0 }}>
        Streams appear on new projects, Hotlist, sales pages, and Email Settings. Adding a stream creates
        empty VIC / QLD email setting rows automatically.
      </p>

      {error ? (
        <div style={{ marginBottom: "12px", color: "#842029", fontSize: "0.9rem", flexShrink: 0 }}>{error}</div>
      ) : null}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "12px",
          alignItems: "start",
          alignContent: "start",
          overflow: "auto",
        }}
      >
        {loading ? (
          <div style={{ color: UI.textMuted, gridColumn: "1 / -1" }}>Loading…</div>
        ) : (
          streamColumns.map((columnStreams, colIndex) => (
            <div
              key={`stream-col-${colIndex}`}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                minWidth: 0,
              }}
            >
              {columnStreams.map((s) => {
                const colors = streamCardColors(s);
                return (
                  <div
                    key={s.id ?? s.name}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      overflow: "hidden",
                      borderRadius: "10px",
                      border: `1px solid ${colors.darker}`,
                      background: colors.lighter,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        background: colors.darker,
                        color: WHITE,
                        fontWeight: 700,
                        fontSize: "0.95rem",
                        padding: "10px 14px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={s.display_name || s.name}
                    >
                      {s.display_name || s.name}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                        padding: "12px 14px",
                        flex: 1,
                      }}
                    >
                      <div style={{ fontSize: "0.82rem", color: MONUMENT, wordBreak: "break-word", flex: 1 }}>
                        Project value: {s.name}
                        {s.badge_acronym ? ` · Badge: ${s.badge_acronym}` : ""}
                      </div>
                      <button
                        type="button"
                        onClick={() => openEdit(s)}
                        disabled={saving}
                        style={{
                          alignSelf: "flex-start",
                          padding: "7px 14px",
                          borderRadius: "8px",
                          border: "none",
                          background: colors.darker,
                          color: WHITE,
                          fontWeight: 600,
                          cursor: saving ? "not-allowed" : "pointer",
                          opacity: saving ? 0.6 : 1,
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div
        style={{
          flexShrink: 0,
          marginTop: "auto",
          display: "flex",
          alignItems: "flex-end",
          gap: "12px",
          paddingTop: "16px",
          paddingBottom: "4px",
        }}
      >
        <button
          type="button"
          onClick={openAddModal}
          disabled={saving}
          style={addStreamButtonStyle}
          onMouseEnter={
            addStreamUsesSavedStyle
              ? undefined
              : (e) => {
                  e.currentTarget.style.background = streamColorHover(MENU.purple);
                }
          }
          onMouseLeave={
            addStreamUsesSavedStyle
              ? undefined
              : (e) => {
                  e.currentTarget.style.background = MENU.purple;
                }
          }
        >
          Add<br />Stream
        </button>
      </div>

      {showAddModal ? (
        <div
          role="presentation"
          onClick={closeAddModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.45)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            boxSizing: "border-box",
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-stream-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleAdd}
            style={{
              width: "100%",
              maxWidth: "440px",
              background: WHITE,
              borderRadius: "12px",
              border: `1px solid ${MONUMENT}33`,
              boxShadow: "0 16px 48px rgba(0,0,0,0.28)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              id="add-stream-title"
              style={{
                background: MONUMENT,
                color: WHITE,
                fontWeight: 700,
                fontSize: "1.1rem",
                padding: "14px 18px",
              }}
            >
              Add stream
            </div>
            <div
              style={{
                padding: "18px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.88rem", color: MONUMENT }}>
                Name (stored on projects)
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Coastal Living"
                  style={inputStyle}
                  disabled={saving}
                  autoFocus
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.88rem", color: MONUMENT }}>
                Display name (Email Settings / lists)
                <input
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="Defaults to name"
                  style={inputStyle}
                  disabled={saving}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.88rem", color: MONUMENT }}>
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
            </div>
            <div
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
                padding: "14px 18px",
                borderTop: `1px solid ${MONUMENT}22`,
              }}
            >
              <button
                type="button"
                onClick={closeAddModal}
                disabled={saving}
                style={{
                  padding: "9px 14px",
                  borderRadius: "8px",
                  border: `1px solid ${MONUMENT}33`,
                  background: "transparent",
                  color: MONUMENT,
                  fontWeight: 600,
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !newName.trim()}
                style={{
                  padding: "9px 16px",
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
            </div>
          </form>
        </div>
      ) : null}

      {editingStream ? (
        <div
          role="presentation"
          onClick={closeEdit}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.45)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            boxSizing: "border-box",
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-stream-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveEdit}
            style={{
              width: "100%",
              maxWidth: "440px",
              background: WHITE,
              borderRadius: "12px",
              border: `2px solid ${editColors?.darker || MONUMENT}`,
              boxShadow: "0 16px 48px rgba(0,0,0,0.28)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              id="edit-stream-title"
              style={{
                background: editColors?.darker || MONUMENT,
                color: WHITE,
                fontWeight: 700,
                fontSize: "1.1rem",
                padding: "14px 18px",
              }}
            >
              Edit stream
            </div>
            <div
              style={{
                padding: "18px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                background: editColors?.lighter || WHITE,
              }}
            >
              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.88rem", color: MONUMENT }}>
                Name (stored on projects)
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={saving || editingStream.is_sgf}
                  style={editingStream.is_sgf ? inputDisabledStyle : inputStyle}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.88rem", color: MONUMENT }}>
                Display name
                <input
                  value={editForm.display_name}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, display_name: e.target.value }))}
                  disabled={saving}
                  style={inputStyle}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.88rem", color: MONUMENT }}>
                Badge acronym
                <input
                  value={editForm.badge_acronym}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, badge_acronym: e.target.value }))}
                  maxLength={8}
                  disabled={saving}
                  style={inputStyle}
                />
              </label>
            </div>
            <div
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "space-between",
                padding: "14px 18px",
                borderTop: `1px solid ${MONUMENT}22`,
                background: WHITE,
              }}
            >
              <button
                type="button"
                onClick={handleDeleteFromModal}
                disabled={saving || editingStream.is_sgf}
                style={{
                  padding: "9px 14px",
                  borderRadius: "8px",
                  border: `1px solid ${editingStream.is_sgf ? `${MONUMENT}22` : "#b42318"}`,
                  background: "transparent",
                  color: editingStream.is_sgf ? UI.textMuted : "#b42318",
                  fontWeight: 600,
                  cursor: saving || editingStream.is_sgf ? "not-allowed" : "pointer",
                  opacity: editingStream.is_sgf ? 0.45 : 1,
                }}
              >
                Delete
              </button>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  onClick={closeEdit}
                  disabled={saving}
                  style={{
                    padding: "9px 14px",
                    borderRadius: "8px",
                    border: `1px solid ${MONUMENT}33`,
                    background: "transparent",
                    color: MONUMENT,
                    fontWeight: 600,
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: "9px 16px",
                    borderRadius: "8px",
                    border: "none",
                    background: editColors?.darker || MONUMENT,
                    color: WHITE,
                    fontWeight: 600,
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: saving ? 0.65 : 1,
                  }}
                >
                  {saving ? "Saving…" : "OK"}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
