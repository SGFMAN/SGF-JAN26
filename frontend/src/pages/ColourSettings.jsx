import React, { useCallback, useEffect, useState } from "react";
import { COLORBOND_COLOURS } from "../constants/colorbondColours";
import { getApiHeaders } from "../utils/auth";
import { UI } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const API_URL = "";

export default function ColourSettings() {
  const [polytecCatalogue, setPolytecCatalogue] = useState(null);
  const [loadingPolytec, setLoadingPolytec] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingSample, setEditingSample] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    imagePreview: "",
    imageFile: null,
  });

  const loadPolytec = useCallback(async () => {
    try {
      setLoadingPolytec(true);
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
      setPolytecCatalogue(null);
    } finally {
      setLoadingPolytec(false);
    }
  }, []);

  useEffect(() => {
    void loadPolytec();
  }, [loadPolytec]);

  const getColourHex = (r, g, b) => {
    return `#${[r, g, b]
      .map((x) => {
        const hex = x.toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      })
      .join("")}`;
  };

  const samples = polytecCatalogue?.samples || [];

  const handleColorClick = (sample) => {
    setEditingSample(sample);
    setEditForm({
      name: sample.name || "",
      imagePreview: sample.image_url || "",
      imageFile: null,
    });
    setShowModal(true);
  };

  const handleModalClose = () => {
    if (saving) return;
    setShowModal(false);
    setEditingSample(null);
    setEditForm({ name: "", imagePreview: "", imageFile: null });
  };

  const handleModalOk = async () => {
    if (!editingSample?.id || !editForm.name.trim()) return;
    try {
      setSaving(true);
      const formData = new FormData();
      formData.append("name", editForm.name.trim());
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
      await loadPolytec();
      setShowModal(false);
      setEditingSample(null);
      setEditForm({ name: "", imagePreview: "", imageFile: null });
    } catch (e) {
      alert(e.message || "Failed to save sample");
    } finally {
      setSaving(false);
    }
  };

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

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto", paddingRight: "8px" }}>
          {selectedGroup === "colorbond" && (
            <>
              <h3 style={{ fontSize: "1.1rem", margin: 0, color: MONUMENT, fontWeight: 600 }}>Colorbond Colours</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {COLORBOND_COLOURS.map((colour, index) => {
                  const hex = getColourHex(colour.r, colour.g, colour.b);
                  return (
                    <div
                      key={index}
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
              <h3 style={{ fontSize: "1.1rem", margin: 0, color: MONUMENT, fontWeight: 600 }}>
                {polytecCatalogue?.name || "Polytec - Doors & Panels"}
              </h3>
              {loadingPolytec ? (
                <div style={{ color: UI.textMuted, fontSize: "0.9rem" }}>Loading…</div>
              ) : loadError ? (
                <div style={{ color: "#842029", fontSize: "0.9rem" }}>{loadError}</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {samples.map((sample) => (
                    <div
                      key={sample.id}
                      onClick={() => handleColorClick(sample)}
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

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "24px" }}>
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
                disabled={saving || !editForm.name.trim()}
                style={{
                  padding: "10px 20px",
                  border: "none",
                  borderRadius: "8px",
                  backgroundColor: saving || !editForm.name.trim() ? "#ccc" : MONUMENT,
                  color: WHITE,
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  cursor: saving || !editForm.name.trim() ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "Saving…" : "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
