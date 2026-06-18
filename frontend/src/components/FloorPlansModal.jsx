import React, { useCallback, useEffect, useState } from "react";
import { getApiHeaders, getLoggedInUserId, getPasswordType } from "../utils/auth";
import FloorPlanCropModal from "./FloorPlanCropModal";
import FloorPlanDefine3DModal from "./FloorPlanDefine3DModal";
import FloorPlanScaleModal from "./FloorPlanScaleModal";
import ModalBackdrop from "./ModalBackdrop";

import { UI } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;

const EMPTY_FORM = {
  name: "",
  category: "Affordable",
  sizeSqm: "",
  dollarValue: "",
  imageFile: null,
  imagePreview: "",
  previewType: "image",
};

function formatDollarDisplay(value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Number(value).toLocaleString("en-AU");
}

function isPdfUpload(file) {
  if (!file) return false;
  return file.type === "application/pdf" || String(file.name || "").toLowerCase().endsWith(".pdf");
}

function FloorPlanFilePreview({ src, fileType = "image", alt = "Floor plan preview", style = {} }) {
  if (!src) return null;
  const frameStyle = {
    width: "100%",
    maxHeight: "260px",
    minHeight: "160px",
    borderRadius: "8px",
    border: "1px solid #eee",
    background: UI.inputBg,
    ...style,
  };
  if (fileType === "pdf") {
    return (
      <iframe
        src={src}
        title={alt}
        style={{ ...frameStyle, height: "260px" }}
      />
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      style={{ ...frameStyle, objectFit: "contain", display: "block" }}
    />
  );
}

function authHeadersForUpload() {
  return {
    "X-User-Id": getLoggedInUserId() || "",
    "X-Password-Type": getPasswordType() || "global",
  };
}

function modalCard(extra = {}) {
  return {
    background: WHITE,
    borderRadius: "16px",
    padding: "24px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
    onClick: (e) => e.stopPropagation(),
    ...extra,
  };
}

const btnSecondary = {
  background: SECTION_GREY,
  color: MONUMENT,
  border: "none",
  borderRadius: "8px",
  padding: "10px 18px",
  fontSize: "0.95rem",
  fontWeight: 500,
  cursor: "pointer",
};

const btnPrimary = {
  background: MONUMENT,
  color: WHITE,
  border: "none",
  borderRadius: "8px",
  padding: "10px 18px",
  fontSize: "0.95rem",
  fontWeight: 500,
  cursor: "pointer",
};

const btnDanger = {
  ...btnPrimary,
  background: "#dc3545",
};

export default function FloorPlansModal({ onClose }) {
  const [floorPlans, setFloorPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const [cropFile, setCropFile] = useState(null);
  const [scaleSession, setScaleSession] = useState(null);
  const [showDefine3DModal, setShowDefine3DModal] = useState(false);

  const loadFloorPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/maps/floor-plans", { headers: getApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to load floor plans");
      }
      const plans = data.floorPlans || [];
      setFloorPlans(plans);
      setSelectedId((prev) => {
        if (prev && plans.some((p) => p.id === prev)) return prev;
        return plans[0]?.id ?? null;
      });
    } catch (err) {
      setError(err.message || "Failed to load floor plans");
      setFloorPlans([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFloorPlans();
  }, [loadFloorPlans]);

  const selectedPlan = floorPlans.find((p) => p.id === selectedId) || null;

  function openAddModal() {
    setEditingPlan(null);
    setForm(EMPTY_FORM);
    setShowFormModal(true);
  }

  function openEditModal() {
    if (!selectedPlan) return;
    setEditingPlan(selectedPlan);
    setForm({
      name: selectedPlan.name,
      category: selectedPlan.category,
      sizeSqm: String(selectedPlan.sizeSqm),
      dollarValue:
        selectedPlan.dollarValue != null && Number.isFinite(selectedPlan.dollarValue)
          ? String(selectedPlan.dollarValue)
          : "",
      imageFile: null,
      imagePreview: selectedPlan.imageUrl || "",
      previewType: selectedPlan.fileType || "image",
    });
    setShowFormModal(true);
  }

  function closeFormModal() {
    setShowFormModal(false);
    setEditingPlan(null);
    setForm(EMPTY_FORM);
  }

  function onImageChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isPdfUpload(file)) {
      setForm((prev) => ({
        ...prev,
        imageFile: file,
        imagePreview: URL.createObjectURL(file),
        previewType: "pdf",
      }));
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setForm((prev) => ({
        ...prev,
        imageFile: file,
        imagePreview: reader.result,
        previewType: "image",
      }));
    };
    reader.readAsDataURL(file);
  }

  async function uploadFloorPlan(imageFile, scale) {
    const body = new FormData();
    body.append("name", form.name.trim());
    body.append("category", form.category);
    body.append("size_sqm", String(Number.parseFloat(form.sizeSqm)));
    if (form.dollarValue.trim() !== "") {
      body.append("dollar_value", form.dollarValue.trim());
    } else {
      body.append("dollar_value", "");
    }
    if (imageFile) body.append("image", imageFile);
    if (scale) {
      body.append("scale_line_x1", String(scale.scaleLineX1));
      body.append("scale_line_y1", String(scale.scaleLineY1));
      body.append("scale_line_x2", String(scale.scaleLineX2));
      body.append("scale_line_y2", String(scale.scaleLineY2));
      body.append("scale_line_meters", String(scale.scaleLineMeters));
    }

    const url = editingPlan
      ? `/api/maps/floor-plans/${editingPlan.id}`
      : "/api/maps/floor-plans";
    const res = await fetch(url, {
      method: editingPlan ? "PUT" : "POST",
      headers: authHeadersForUpload(),
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Failed to save floor plan");
    }
    closeFormModal();
    setCropFile(null);
    setScaleSession(null);
    await loadFloorPlans();
    if (data.floorPlan?.id) setSelectedId(data.floorPlan.id);
  }

  async function handleSaveForm() {
    if (!form.name.trim()) {
      alert("Please enter a floor plan name.");
      return;
    }
    const size = Number.parseFloat(form.sizeSqm);
    if (!Number.isFinite(size) || size <= 0) {
      alert("Please enter a valid size in square metres.");
      return;
    }
    if (!editingPlan && !form.imageFile) {
      alert("Please upload an image or PDF for the floor plan.");
      return;
    }

    if (form.imageFile) {
      setCropFile(form.imageFile);
      return;
    }

    setSaving(true);
    try {
      await uploadFloorPlan(null);
    } catch (err) {
      alert(err.message || "Failed to save floor plan");
    } finally {
      setSaving(false);
    }
  }

  async function handleCropConfirm({ blob, cropCorners }) {
    setCropFile(null);
    setScaleSession({ blob, cropCorners });
  }

  async function handleScaleConfirm(scale) {
    if (!scaleSession) return;
    const safeName = form.name.trim().replace(/[^\w\s-]+/g, "").replace(/\s+/g, "-") || "floor-plan";
    const imageFile = new File([scaleSession.blob], `${safeName}.png`, { type: "image/png" });
    setSaving(true);
    try {
      await uploadFloorPlan(imageFile, scale);
    } catch (err) {
      alert(err.message || "Failed to save floor plan");
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDelete() {
    if (!selectedPlan) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/maps/floor-plans/${selectedPlan.id}`, {
        method: "DELETE",
        headers: getApiHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to delete floor plan");
      }
      setShowDeleteModal(false);
      await loadFloorPlans();
    } catch (err) {
      alert(err.message || "Failed to delete floor plan");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <ModalBackdrop zIndex={2000}>
        <div
          style={modalCard({
            width: "min(920px, 94vw)",
            maxHeight: "90vh",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          })}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: "1.4rem", color: MONUMENT, fontWeight: 600 }}>
              Floor Plans
            </h2>
            <button type="button" onClick={onClose} style={btnSecondary}>
              Close
            </button>
          </div>

          {error && (
            <div style={{ color: "#842029", fontSize: "0.9rem", background: "#fdecea", padding: "8px 12px", borderRadius: "8px" }}>
              {error}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(220px, 1fr) minmax(280px, 1.4fr)",
              gap: "16px",
              flex: 1,
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "10px",
                overflow: "auto",
                maxHeight: "420px",
                background: "#fafafa",
              }}
            >
              {loading ? (
                <div style={{ padding: "16px", color: "#666" }}>Loading…</div>
              ) : floorPlans.length === 0 ? (
                <div style={{ padding: "16px", color: "#666" }}>No floor plans yet.</div>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {floorPlans.map((plan) => (
                    <li key={plan.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(plan.id)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "12px 14px",
                          border: "none",
                          borderBottom: "1px solid #eee",
                          background: selectedId === plan.id ? "#ede9fe" : "transparent",
                          cursor: "pointer",
                          color: MONUMENT,
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{plan.name}</div>
                        <div style={{ fontSize: "0.82rem", color: "#666", marginTop: "2px" }}>
                          {plan.category} · {plan.sizeSqm} m²
                          {formatDollarDisplay(plan.dollarValue) != null && (
                            <> · ${formatDollarDisplay(plan.dollarValue)}</>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "10px",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                minHeight: "280px",
                background: WHITE,
              }}
            >
              <strong style={{ color: MONUMENT }}>Preview</strong>
              {selectedPlan ? (
                <>
                  {selectedPlan.imageUrl ? (
                    <FloorPlanFilePreview
                      src={selectedPlan.imageUrl}
                      fileType={selectedPlan.fileType || "image"}
                      alt={selectedPlan.name}
                    />
                  ) : (
                    <div
                      style={{
                        flex: 1,
                        minHeight: "160px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#888",
                        background: UI.inputBg,
                        borderRadius: "8px",
                      }}
                    >
                      No file uploaded
                    </div>
                  )}
                  {selectedPlan.imageUrl && (
                    <button
                      type="button"
                      onClick={() => setShowDefine3DModal(true)}
                      style={{
                        ...btnPrimary,
                        width: "100%",
                      }}
                    >
                      Define 3D
                    </button>
                  )}
                  <div style={{ fontSize: "0.95rem", lineHeight: 1.5 }}>
                    <div>
                      <span style={{ color: "#666" }}>Name: </span>
                      {selectedPlan.name}
                    </div>
                    <div>
                      <span style={{ color: "#666" }}>Category: </span>
                      {selectedPlan.category}
                    </div>
                    <div>
                      <span style={{ color: "#666" }}>Size: </span>
                      {selectedPlan.sizeSqm} m²
                    </div>
                    <div>
                      <span style={{ color: "#666" }}>Dollar value: </span>
                      {formatDollarDisplay(selectedPlan.dollarValue) != null
                        ? `$${formatDollarDisplay(selectedPlan.dollarValue)}`
                        : "—"}
                    </div>
                    {selectedPlan.scale && (
                      <div>
                        <span style={{ color: "#666" }}>Scale: </span>
                        {selectedPlan.scale.meters} m over{" "}
                        {selectedPlan.scale.pixelDistance.toFixed(1)} px (
                        {selectedPlan.scale.metersPerPixel.toFixed(4)} m/px)
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#888",
                  }}
                >
                  Select a floor plan to preview
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button type="button" onClick={openAddModal} style={btnPrimary}>
              Add
            </button>
            <button
              type="button"
              onClick={openEditModal}
              disabled={!selectedPlan}
              style={{ ...btnSecondary, opacity: selectedPlan ? 1 : 0.5, cursor: selectedPlan ? "pointer" : "not-allowed" }}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              disabled={!selectedPlan}
              style={{ ...btnDanger, opacity: selectedPlan ? 1 : 0.5, cursor: selectedPlan ? "pointer" : "not-allowed" }}
            >
              Delete
            </button>
          </div>
        </div>
      </ModalBackdrop>

      {showFormModal && (
        <ModalBackdrop zIndex={2100}>
          <div style={modalCard({ width: "min(480px, 92vw)" })}>
            <h3 style={{ margin: "0 0 16px", color: MONUMENT, fontSize: "1.2rem" }}>
              {editingPlan ? "Edit Floor Plan" : "Add Floor Plan"}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "0.9rem", color: "#555" }}>Name</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  style={{ padding: "10px 12px", borderRadius: "8px", border: "1px solid #ccc" }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "0.9rem", color: "#555" }}>Category</span>
                <select
                  value={form.category}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                  style={{ padding: "10px 12px", borderRadius: "8px", border: "1px solid #ccc" }}
                >
                  <option value="Affordable">Affordable</option>
                  <option value="Superior">Superior</option>
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "0.9rem", color: "#555" }}>Size (m²)</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.sizeSqm}
                  onChange={(e) => setForm((prev) => ({ ...prev, sizeSqm: e.target.value }))}
                  style={{ padding: "10px 12px", borderRadius: "8px", border: "1px solid #ccc" }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "0.9rem", color: "#555" }}>Dollar value</span>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "0.95rem", color: MONUMENT }}>$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.dollarValue}
                    onChange={(e) => setForm((prev) => ({ ...prev, dollarValue: e.target.value }))}
                    placeholder="Optional"
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid #ccc",
                    }}
                  />
                </div>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "0.9rem", color: "#555" }}>
                  Image or PDF{editingPlan ? " (leave blank to keep current)" : ""}
                </span>
                <input
                  type="file"
                  accept="image/*,application/pdf,.pdf"
                  onChange={onImageChange}
                />
              </label>
              {form.imagePreview && (
                <FloorPlanFilePreview
                  src={form.imagePreview}
                  fileType={form.previewType}
                  alt="Preview"
                  style={{ maxHeight: "160px", minHeight: "120px" }}
                />
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
              <button type="button" onClick={closeFormModal} disabled={saving} style={btnSecondary}>
                Cancel
              </button>
              <button type="button" onClick={() => void handleSaveForm()} disabled={saving || !!cropFile || !!scaleSession} style={btnPrimary}>
                {saving ? "Saving…" : cropFile ? "Outline plan…" : scaleSession ? "Set scale…" : "Save"}
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {cropFile && (
        <FloorPlanCropModal
          file={cropFile}
          onConfirm={(result) => handleCropConfirm(result)}
          onCancel={() => setCropFile(null)}
        />
      )}

      {scaleSession && (
        <FloorPlanScaleModal
          imageBlob={scaleSession.blob}
          snapCorners={scaleSession.cropCorners}
          onConfirm={(scale) => handleScaleConfirm(scale)}
          onCancel={() => setScaleSession(null)}
        />
      )}

      {showDefine3DModal && selectedPlan && (
        <FloorPlanDefine3DModal
          plan={selectedPlan}
          onClose={() => setShowDefine3DModal(false)}
          onDefine3DUpdated={(updatedPlan) => {
            if (!updatedPlan?.id) return;
            setFloorPlans((plans) =>
              plans.map((p) => (p.id === updatedPlan.id ? { ...p, ...updatedPlan } : p))
            );
          }}
        />
      )}

      {showDeleteModal && selectedPlan && (
        <ModalBackdrop zIndex={2100}>
          <div style={modalCard({ width: "min(440px, 92vw)" })}>
            <h3 style={{ margin: "0 0 12px", color: MONUMENT, fontSize: "1.2rem" }}>Delete Floor Plan</h3>
            <p style={{ margin: "0 0 20px", color: "#666", lineHeight: 1.5 }}>
              Are you sure you want to delete &ldquo;{selectedPlan.name}&rdquo;? This action cannot be undone.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                style={btnSecondary}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                disabled={deleting}
                style={btnDanger}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}
    </>
  );
}
