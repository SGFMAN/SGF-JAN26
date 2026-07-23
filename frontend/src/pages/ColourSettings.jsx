import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COLORBOND_COLOURS } from "../constants/colorbondColours";
import { getApiHeaders } from "../utils/auth";
import { buildSavedButtonStyle } from "../utils/uiButtonStyles.js";
import { MENU, UI } from "../utils/uiThemeTokens.js";
import { streamColorHover } from "../utils/streamColors.js";

const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const API_URL = "";
const DELETE_COLOUR_BUTTON_ID = 2;

function sortButtonStyle(active) {
  return {
    padding: "8px 14px",
    borderRadius: "8px",
    border: active ? `1px solid ${MONUMENT}` : "1px solid #ddd",
    background: active ? MONUMENT : WHITE,
    color: active ? WHITE : MONUMENT,
    fontSize: "0.88rem",
    fontWeight: 600,
    cursor: "pointer",
  };
}

function mergeButtonStyle(styleId, fallback) {
  const saved = buildSavedButtonStyle(styleId, true);
  return saved ? { ...saved } : fallback;
}

export default function ColourSettings() {
  const [polytecCatalogue, setPolytecCatalogue] = useState(null);
  const [loadingPolytec, setLoadingPolytec] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [sortMode, setSortMode] = useState("group"); // "group" | "alpha"
  const [showModal, setShowModal] = useState(false);
  const [showSubgroupsModal, setShowSubgroupsModal] = useState(false);
  const [subgroupDraftName, setSubgroupDraftName] = useState("");
  const [editingSubgroupId, setEditingSubgroupId] = useState(null);
  const [editingSubgroupName, setEditingSubgroupName] = useState("");
  const [subgroupSaving, setSubgroupSaving] = useState(false);
  const [editingSample, setEditingSample] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    subgroupId: "",
    imagePreview: "",
    imageFile: null,
  });
  const listScrollRef = useRef(null);
  const restoreSampleIdRef = useRef(null);
  const restoreScrollTopRef = useRef(null);
  const pendingRestoreRef = useRef(false);

  const loadPolytec = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoadingPolytec(true);
      setLoadError("");
      const res = await fetch(`${API_URL}/api/colour-groups/polytec`, {
        headers: getApiHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setPolytecCatalogue(data);
    } catch (e) {
      console.error(e);
      setLoadError(e.message || "Failed to load Polytec colours");
      if (!silent) setPolytecCatalogue(null);
    } finally {
      if (!silent) setLoadingPolytec(false);
    }
  }, []);

  useEffect(() => {
    void loadPolytec();
  }, [loadPolytec]);

  function captureListPosition(preferredSampleId = null) {
    const scroller = listScrollRef.current;
    if (scroller) restoreScrollTopRef.current = scroller.scrollTop;
    if (preferredSampleId != null) {
      restoreSampleIdRef.current = preferredSampleId;
      return;
    }
    if (!scroller) return;
    const rows = scroller.querySelectorAll("[data-sample-id]");
    const scrollerTop = scroller.getBoundingClientRect().top;
    let bestId = null;
    let bestDist = Infinity;
    rows.forEach((row) => {
      const rect = row.getBoundingClientRect();
      const dist = Math.abs(rect.top - scrollerTop);
      if (rect.bottom > scrollerTop + 8 && dist < bestDist) {
        bestDist = dist;
        bestId = row.getAttribute("data-sample-id");
      }
    });
    if (bestId != null) restoreSampleIdRef.current = bestId;
  }

  function requestListRestore(preferredSampleId = null) {
    captureListPosition(preferredSampleId);
    pendingRestoreRef.current = true;
  }

  function restoreListPosition() {
    if (!pendingRestoreRef.current) return;
    const scroller = listScrollRef.current;
    if (!scroller) return;
    const sampleId = restoreSampleIdRef.current;
    const row =
      sampleId != null
        ? scroller.querySelector(`[data-sample-id="${CSS.escape(String(sampleId))}"]`)
        : null;
    if (row) {
      row.scrollIntoView({ block: "center", inline: "nearest" });
      pendingRestoreRef.current = false;
      return;
    }
    if (restoreScrollTopRef.current != null) {
      scroller.scrollTop = restoreScrollTopRef.current;
    }
    pendingRestoreRef.current = false;
  }

  useEffect(() => {
    if (loadingPolytec || showModal || showSubgroupsModal) return;
    if (!pendingRestoreRef.current) return;
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => restoreListPosition());
    });
    return () => window.cancelAnimationFrame(id);
  }, [loadingPolytec, showModal, showSubgroupsModal, sortMode, polytecCatalogue, selectedGroup]);

  const getColourHex = (r, g, b) => {
    return `#${[r, g, b]
      .map((x) => {
        const hex = x.toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      })
      .join("")}`;
  };

  const subgroups = polytecCatalogue?.subgroups || [];

  const alphabeticalSamples = useMemo(() => {
    const out = [];
    for (const sg of subgroups) {
      for (const sample of sg.samples || []) {
        out.push({ sample, subgroup: sg });
      }
    }
    return out.sort((a, b) =>
      String(a.sample.name || "").localeCompare(String(b.sample.name || ""), undefined, {
        sensitivity: "base",
      })
    );
  }, [subgroups]);

  const colorbondColours = useMemo(() => {
    if (sortMode === "alpha") {
      return [...COLORBOND_COLOURS].sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" })
      );
    }
    return COLORBOND_COLOURS;
  }, [sortMode]);

  const handleColorClick = (sample, subgroup) => {
    requestListRestore(sample?.id ?? null);
    setEditingSample(sample);
    setEditForm({
      name: sample.name || "",
      subgroupId: String(subgroup.id),
      imagePreview: sample.image_url || "",
      imageFile: null,
    });
    setShowModal(true);
  };

  const handleModalClose = () => {
    if (saving) return;
    requestListRestore(editingSample?.id ?? restoreSampleIdRef.current);
    setShowModal(false);
    setEditingSample(null);
    setEditForm({ name: "", subgroupId: "", imagePreview: "", imageFile: null });
  };

  const handleModalOk = async () => {
    if (!editingSample?.id || !editForm.name.trim() || !editForm.subgroupId) return;
    const restoreId = editingSample.id;
    try {
      setSaving(true);
      const formData = new FormData();
      formData.append("name", editForm.name.trim());
      formData.append("subgroup_id", editForm.subgroupId);
      if (editForm.imageFile) {
        formData.append("image", editForm.imageFile);
      }
      const headers = getApiHeaders();
      delete headers["Content-Type"];
      const res = await fetch(`${API_URL}/api/colour-samples/${editingSample.id}`, {
        method: "PUT",
        headers,
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      requestListRestore(restoreId);
      await loadPolytec({ silent: true });
      setShowModal(false);
      setEditingSample(null);
      setEditForm({ name: "", subgroupId: "", imagePreview: "", imageFile: null });
    } catch (e) {
      alert(e.message || "Failed to save sample");
    } finally {
      setSaving(false);
    }
  };

  const handleModalDelete = async () => {
    if (!editingSample?.id) return;
    if (!window.confirm(`Delete colour "${editingSample.name}"?`)) return;
    try {
      setSaving(true);
      const res = await fetch(`${API_URL}/api/colour-samples/${editingSample.id}`, {
        method: "DELETE",
        headers: getApiHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      requestListRestore(null);
      await loadPolytec({ silent: true });
      setShowModal(false);
      setEditingSample(null);
      setEditForm({ name: "", subgroupId: "", imagePreview: "", imageFile: null });
    } catch (e) {
      alert(e.message || "Failed to delete sample");
    } finally {
      setSaving(false);
    }
  };

  function openSubgroupsModal() {
    requestListRestore();
    setSubgroupDraftName("");
    setEditingSubgroupId(null);
    setEditingSubgroupName("");
    setShowSubgroupsModal(true);
  }

  function closeSubgroupsModal() {
    if (subgroupSaving) return;
    requestListRestore(restoreSampleIdRef.current);
    setShowSubgroupsModal(false);
    setSubgroupDraftName("");
    setEditingSubgroupId(null);
    setEditingSubgroupName("");
  }

  async function handleAddSubgroup(e) {
    e?.preventDefault?.();
    const name = subgroupDraftName.trim();
    if (!name) {
      alert("Enter a subgroup name.");
      return;
    }
    try {
      setSubgroupSaving(true);
      const res = await fetch(`${API_URL}/api/colour-subgroups`, {
        method: "POST",
        headers: getApiHeaders(),
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setSubgroupDraftName("");
      requestListRestore(restoreSampleIdRef.current);
      await loadPolytec({ silent: true });
    } catch (err) {
      alert(err.message || "Failed to add subgroup");
    } finally {
      setSubgroupSaving(false);
    }
  }

  function startEditSubgroup(subgroup) {
    setEditingSubgroupId(subgroup.id);
    setEditingSubgroupName(subgroup.name || "");
  }

  function cancelEditSubgroup() {
    setEditingSubgroupId(null);
    setEditingSubgroupName("");
  }

  async function handleSaveSubgroup(e) {
    e?.preventDefault?.();
    if (!editingSubgroupId) return;
    const name = editingSubgroupName.trim();
    if (!name) {
      alert("Enter a subgroup name.");
      return;
    }
    try {
      setSubgroupSaving(true);
      const res = await fetch(`${API_URL}/api/colour-subgroups/${editingSubgroupId}`, {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setEditingSubgroupId(null);
      setEditingSubgroupName("");
      requestListRestore(restoreSampleIdRef.current);
      await loadPolytec({ silent: true });
    } catch (err) {
      alert(err.message || "Failed to update subgroup");
    } finally {
      setSubgroupSaving(false);
    }
  }

  async function handleDeleteSubgroup(subgroup) {
    const count = Number(subgroup.sample_count) || (subgroup.samples || []).length || 0;
    const msg =
      count > 0
        ? `Delete subgroup "${subgroup.name}" and its ${count} colour${count === 1 ? "" : "s"}?`
        : `Delete subgroup "${subgroup.name}"?`;
    if (!window.confirm(msg)) return;
    try {
      setSubgroupSaving(true);
      const res = await fetch(`${API_URL}/api/colour-subgroups/${subgroup.id}`, {
        method: "DELETE",
        headers: getApiHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      if (editingSubgroupId === subgroup.id) {
        setEditingSubgroupId(null);
        setEditingSubgroupName("");
      }
      requestListRestore(restoreSampleIdRef.current);
      await loadPolytec({ silent: true });
    } catch (err) {
      alert(err.message || "Failed to delete subgroup");
    } finally {
      setSubgroupSaving(false);
    }
  }

  function handleSortModeChange(nextMode) {
    if (nextMode === sortMode) return;
    requestListRestore();
    setSortMode(nextMode);
  }

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setEditForm((prev) => ({
        ...prev,
        imageFile: file,
        imagePreview: typeof reader.result === "string" ? reader.result : prev.imagePreview,
      }));
    };
    reader.readAsDataURL(file);
  };

  const deleteButtonFallbackStyle = {
    background: MENU.purple,
    color: MENU.activeText,
    border: `1px solid ${UI.outline}`,
    borderRadius: "8px",
    padding: "10px 20px",
    fontSize: "1rem",
    fontWeight: 500,
    cursor: saving ? "not-allowed" : "pointer",
    transition: "background 0.2s",
    flexShrink: 0,
    boxSizing: "border-box",
    opacity: saving ? 0.65 : 1,
  };
  const deleteButtonStyle = mergeButtonStyle(DELETE_COLOUR_BUTTON_ID, deleteButtonFallbackStyle);
  const deleteUsesSavedStyle = Boolean(buildSavedButtonStyle(DELETE_COLOUR_BUTTON_ID, true));

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        padding: "24px 32px",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        overflow: "auto",
        boxSizing: "border-box",
      }}
    >
      <h2 style={{ fontSize: "1.5rem", margin: 0, color: MONUMENT, fontWeight: 600 }}>Colour Settings</h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 3fr", gap: "24px", flex: 1, minHeight: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto", paddingRight: "8px" }}>
          <h3 style={{ fontSize: "1.1rem", margin: 0, color: MONUMENT, fontWeight: 600 }}>Color Groups</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div
              onClick={() => setSelectedGroup("colorbond")}
              style={{
                padding: "16px 12px",
                border: selectedGroup === "colorbond" ? "2px solid " + MONUMENT : "1px solid #ddd",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s",
                backgroundColor: selectedGroup === "colorbond" ? UI.inputBg : "transparent",
              }}
              onMouseEnter={(e) => {
                if (selectedGroup !== "colorbond") e.currentTarget.style.backgroundColor = UI.inputBg;
              }}
              onMouseLeave={(e) => {
                if (selectedGroup !== "colorbond") e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <div style={{ fontSize: "1rem", fontWeight: 600, color: MONUMENT }}>Colorbond</div>
            </div>

            <div
              onClick={() => setSelectedGroup("polytec")}
              style={{
                padding: "16px 12px",
                border: selectedGroup === "polytec" ? "2px solid " + MONUMENT : "1px solid #ddd",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s",
                backgroundColor: selectedGroup === "polytec" ? UI.inputBg : "transparent",
              }}
              onMouseEnter={(e) => {
                if (selectedGroup !== "polytec") e.currentTarget.style.backgroundColor = UI.inputBg;
              }}
              onMouseLeave={(e) => {
                if (selectedGroup !== "polytec") e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <div style={{ fontSize: "1rem", fontWeight: 600, color: MONUMENT }}>
                {polytecCatalogue?.name || "Polytec - Doors & Panels"}
              </div>
            </div>
          </div>
        </div>

        <div
          ref={listScrollRef}
          style={{ display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto", paddingRight: "8px" }}
        >
          {selectedGroup === "colorbond" && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <h3 style={{ fontSize: "1.1rem", margin: 0, color: MONUMENT, fontWeight: 600 }}>Colorbond Colours</h3>
                <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => handleSortModeChange("group")}
                    style={sortButtonStyle(sortMode === "group")}
                  >
                    Sort by Group
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSortModeChange("alpha")}
                    style={sortButtonStyle(sortMode === "alpha")}
                  >
                    Sort Alphabetically
                  </button>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {colorbondColours.map((colour, index) => {
                  const hex = getColourHex(colour.r, colour.g, colour.b);
                  return (
                    <div
                      key={`${colour.name}-${index}`}
                      data-sample-id={`colorbond-${colour.name}`}
                      style={{
                        background: "transparent",
                        border: "1px solid #ddd",
                        borderRadius: "8px",
                        padding: "12px 8px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        maxWidth: "100%",
                        boxSizing: "border-box",
                      }}
                    >
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "4px",
                          backgroundColor: hex,
                          border: "1px solid #ccc",
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "0.9rem", fontWeight: 500, color: MONUMENT }}>{colour.name}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--sgf-text-primary)" }}>
                          R: {colour.r} G: {colour.g} B: {colour.b}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {selectedGroup === "polytec" && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <h3 style={{ fontSize: "1.1rem", margin: 0, color: MONUMENT, fontWeight: 600 }}>
                  {polytecCatalogue?.name || "Polytec - Doors & Panels"}
                </h3>
                <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => handleSortModeChange("group")}
                    style={sortButtonStyle(sortMode === "group")}
                  >
                    Sort by Group
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSortModeChange("alpha")}
                    style={sortButtonStyle(sortMode === "alpha")}
                  >
                    Sort Alphabetically
                  </button>
                  <button type="button" onClick={openSubgroupsModal} style={sortButtonStyle(false)}>
                    Sub Groups
                  </button>
                </div>
              </div>
              {loadingPolytec ? (
                <div style={{ color: UI.textMuted, fontSize: "0.9rem" }}>Loading…</div>
              ) : loadError ? (
                <div style={{ color: "#842029", fontSize: "0.9rem" }}>{loadError}</div>
              ) : sortMode === "alpha" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {alphabeticalSamples.map(({ sample, subgroup }) => (
                    <div
                      key={sample.id}
                      data-sample-id={sample.id}
                      onClick={() => handleColorClick(sample, subgroup)}
                      style={{
                        background: "transparent",
                        border: "1px solid #ddd",
                        borderRadius: "8px",
                        padding: "10px 8px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        maxWidth: "100%",
                        boxSizing: "border-box",
                        cursor: "pointer",
                        transition: "background 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = UI.inputBg;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <div
                        style={{
                          width: "28px",
                          height: "28px",
                          borderRadius: "4px",
                          border: "1px solid #ccc",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: UI.inputBg,
                          overflow: "hidden",
                        }}
                      >
                        {sample.image_url ? (
                          <img
                            src={sample.image_url}
                            alt={sample.name}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <div
                            style={{
                              fontSize: "6px",
                              color: "var(--sgf-text-primary)",
                              fontWeight: 600,
                              textAlign: "center",
                              lineHeight: "1",
                              letterSpacing: "0.3px",
                            }}
                          >
                            Soon
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "0.85rem", fontWeight: 500, color: MONUMENT }}>{sample.name}</div>
                        <div style={{ fontSize: "0.75rem", color: UI.textMuted }}>{subgroup.name}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {subgroups.map((subgroup) => (
                    <div key={subgroup.id} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <h4
                        style={{
                          fontSize: "0.95rem",
                          margin: 0,
                          color: MONUMENT,
                          fontWeight: 600,
                          paddingBottom: "4px",
                          borderBottom: "1px solid #ddd",
                        }}
                      >
                        {subgroup.name}
                      </h4>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {(subgroup.samples || []).map((sample) => (
                          <div
                            key={sample.id}
                            data-sample-id={sample.id}
                            onClick={() => handleColorClick(sample, subgroup)}
                            style={{
                              background: "transparent",
                              border: "1px solid #ddd",
                              borderRadius: "8px",
                              padding: "10px 8px",
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              maxWidth: "100%",
                              boxSizing: "border-box",
                              cursor: "pointer",
                              transition: "background 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = UI.inputBg;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent";
                            }}
                          >
                            <div
                              style={{
                                width: "28px",
                                height: "28px",
                                borderRadius: "4px",
                                border: "1px solid #ccc",
                                flexShrink: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: UI.inputBg,
                                overflow: "hidden",
                              }}
                            >
                              {sample.image_url ? (
                                <img
                                  src={sample.image_url}
                                  alt={sample.name}
                                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                />
                              ) : (
                                <div
                                  style={{
                                    fontSize: "6px",
                                    color: "var(--sgf-text-primary)",
                                    fontWeight: 600,
                                    textAlign: "center",
                                    lineHeight: "1",
                                    letterSpacing: "0.3px",
                                  }}
                                >
                                  Soon
                                </div>
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: "0.85rem", fontWeight: 500, color: MONUMENT }}>{sample.name}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {!selectedGroup && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "var(--sgf-text-primary)",
                fontSize: "0.9rem",
              }}
            >
              Select a color group from the left to view colors
            </div>
          )}
        </div>
      </div>

      {showModal && editingSample && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={handleModalClose}
        >
          <div
            style={{
              backgroundColor: WHITE,
              borderRadius: "12px",
              padding: "24px",
              width: "90%",
              maxWidth: "500px",
              boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "1.3rem", margin: "0 0 20px 0", color: MONUMENT, fontWeight: 600 }}>
              Edit Polytec Color
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label
                  style={{ display: "block", fontSize: "0.9rem", fontWeight: 500, color: MONUMENT, marginBottom: "6px" }}
                >
                  Name
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  disabled={saving}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    fontSize: "0.9rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label
                  style={{ display: "block", fontSize: "0.9rem", fontWeight: 500, color: MONUMENT, marginBottom: "6px" }}
                >
                  Subgroup
                </label>
                <select
                  value={editForm.subgroupId}
                  onChange={(e) => setEditForm({ ...editForm, subgroupId: e.target.value })}
                  disabled={saving}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    fontSize: "0.9rem",
                    backgroundColor: WHITE,
                    boxSizing: "border-box",
                    cursor: "pointer",
                  }}
                >
                  <option value="">Select a subgroup</option>
                  {subgroups.map((subgroup) => (
                    <option key={subgroup.id} value={String(subgroup.id)}>
                      {subgroup.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  style={{ display: "block", fontSize: "0.9rem", fontWeight: 500, color: MONUMENT, marginBottom: "6px" }}
                >
                  Image
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  disabled={saving}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    fontSize: "0.9rem",
                    boxSizing: "border-box",
                    cursor: "pointer",
                  }}
                />
                {editForm.imagePreview ? (
                  <div style={{ marginTop: "10px" }}>
                    <img
                      src={editForm.imagePreview}
                      alt="Preview"
                      style={{
                        maxWidth: "100%",
                        maxHeight: "200px",
                        borderRadius: "8px",
                        border: "1px solid #ddd",
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "24px", alignItems: "center" }}>
              <button
                type="button"
                onClick={handleModalDelete}
                disabled={saving}
                style={deleteButtonStyle}
                onMouseEnter={
                  deleteUsesSavedStyle || saving
                    ? undefined
                    : (e) => {
                        e.currentTarget.style.background = streamColorHover(MENU.purple);
                      }
                }
                onMouseLeave={
                  deleteUsesSavedStyle || saving
                    ? undefined
                    : (e) => {
                        e.currentTarget.style.background = MENU.purple;
                      }
                }
              >
                Delete
              </button>
              <button
                type="button"
                onClick={handleModalClose}
                disabled={saving}
                style={{
                  padding: "10px 20px",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  backgroundColor: WHITE,
                  color: MONUMENT,
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleModalOk}
                disabled={saving || !editForm.name.trim() || !editForm.subgroupId}
                style={{
                  padding: "10px 20px",
                  border: "none",
                  borderRadius: "8px",
                  backgroundColor:
                    saving || !editForm.name.trim() || !editForm.subgroupId ? "#ccc" : MONUMENT,
                  color: WHITE,
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  cursor:
                    saving || !editForm.name.trim() || !editForm.subgroupId ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "Saving…" : "OK"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSubgroupsModal ? (
        <div
          role="presentation"
          onClick={closeSubgroupsModal}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "24px",
            boxSizing: "border-box",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="subgroups-modal-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: WHITE,
              borderRadius: "12px",
              padding: "24px",
              width: "100%",
              maxWidth: "560px",
              maxHeight: "85vh",
              overflow: "auto",
              boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
              boxSizing: "border-box",
            }}
          >
            <h3
              id="subgroups-modal-title"
              style={{ fontSize: "1.3rem", margin: "0 0 16px 0", color: MONUMENT, fontWeight: 600 }}
            >
              Sub Groups
            </h3>

            <form
              onSubmit={handleAddSubgroup}
              style={{ display: "flex", gap: "8px", marginBottom: "20px", alignItems: "center" }}
            >
              <input
                type="text"
                value={subgroupDraftName}
                onChange={(e) => setSubgroupDraftName(e.target.value)}
                placeholder="New subgroup name"
                disabled={subgroupSaving}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  fontSize: "0.9rem",
                  boxSizing: "border-box",
                }}
              />
              <button
                type="submit"
                disabled={subgroupSaving || !subgroupDraftName.trim()}
                style={{
                  padding: "10px 16px",
                  border: "none",
                  borderRadius: "8px",
                  background: subgroupSaving || !subgroupDraftName.trim() ? "#ccc" : MONUMENT,
                  color: WHITE,
                  fontWeight: 600,
                  cursor: subgroupSaving || !subgroupDraftName.trim() ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Add
              </button>
            </form>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {subgroups.length === 0 ? (
                <div style={{ color: UI.textMuted, fontSize: "0.9rem" }}>No subgroups yet.</div>
              ) : (
                subgroups.map((subgroup) => {
                  const sampleCount =
                    Number(subgroup.sample_count) || (subgroup.samples || []).length || 0;
                  const isEditing = editingSubgroupId === subgroup.id;
                  return (
                    <div
                      key={subgroup.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "10px 12px",
                        border: "1px solid #ddd",
                        borderRadius: "8px",
                        background: UI.inputBg,
                      }}
                    >
                      {isEditing ? (
                        <form
                          onSubmit={handleSaveSubgroup}
                          style={{ display: "flex", flex: 1, gap: "8px", alignItems: "center", minWidth: 0 }}
                        >
                          <input
                            type="text"
                            value={editingSubgroupName}
                            onChange={(e) => setEditingSubgroupName(e.target.value)}
                            disabled={subgroupSaving}
                            autoFocus
                            style={{
                              flex: 1,
                              padding: "8px 10px",
                              border: "1px solid #ddd",
                              borderRadius: "8px",
                              fontSize: "0.9rem",
                              boxSizing: "border-box",
                              minWidth: 0,
                            }}
                          />
                          <button
                            type="submit"
                            disabled={subgroupSaving || !editingSubgroupName.trim()}
                            style={{
                              padding: "8px 12px",
                              border: "none",
                              borderRadius: "8px",
                              background: MONUMENT,
                              color: WHITE,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditSubgroup}
                            disabled={subgroupSaving}
                            style={{
                              padding: "8px 12px",
                              border: "1px solid #ddd",
                              borderRadius: "8px",
                              background: WHITE,
                              color: MONUMENT,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: MONUMENT }}>{subgroup.name}</div>
                            <div style={{ fontSize: "0.78rem", color: UI.textMuted }}>
                              {sampleCount} colour{sampleCount === 1 ? "" : "s"}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => startEditSubgroup(subgroup)}
                            disabled={subgroupSaving}
                            style={{
                              padding: "7px 12px",
                              border: `1px solid ${MONUMENT}33`,
                              borderRadius: "8px",
                              background: WHITE,
                              color: MONUMENT,
                              fontWeight: 600,
                              cursor: subgroupSaving ? "not-allowed" : "pointer",
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSubgroup(subgroup)}
                            disabled={subgroupSaving}
                            style={{
                              padding: "7px 12px",
                              border: "1px solid #b42318",
                              borderRadius: "8px",
                              background: WHITE,
                              color: "#b42318",
                              fontWeight: 600,
                              cursor: subgroupSaving ? "not-allowed" : "pointer",
                            }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "20px" }}>
              <button
                type="button"
                onClick={closeSubgroupsModal}
                disabled={subgroupSaving}
                style={{
                  padding: "10px 18px",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  background: WHITE,
                  color: MONUMENT,
                  fontWeight: 600,
                  cursor: subgroupSaving ? "not-allowed" : "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
