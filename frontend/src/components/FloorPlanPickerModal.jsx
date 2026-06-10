import React, { useCallback, useEffect, useState } from "react";
import { getApiHeaders } from "../utils/auth";
import { fetchFloorPlanImageBlob } from "../utils/floorPlanMap";
import ModalBackdrop from "./ModalBackdrop";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";

function AuthenticatedPlanPreview({ planId, alt }) {
  const [src, setSrc] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;

    (async () => {
      try {
        const blob = await fetchFloorPlanImageBlob(planId);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load preview");
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [planId]);

  if (error) {
    return (
      <div style={{ padding: "24px", color: "#842029", background: "#fdecea", borderRadius: "8px" }}>
        {error}
      </div>
    );
  }
  if (!src) {
    return <div style={{ padding: "24px", color: "#666" }}>Loading preview…</div>;
  }
  return (
    <img
      src={src}
      alt={alt}
      style={{
        width: "100%",
        maxHeight: "260px",
        minHeight: "160px",
        objectFit: "contain",
        display: "block",
        borderRadius: "8px",
        border: "1px solid #eee",
        background: "#f5f5f5",
      }}
    />
  );
}

export default function FloorPlanPickerModal({ onSelect, onClose }) {
  const [floorPlans, setFloorPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const loadFloorPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/maps/floor-plans", { headers: getApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to load floor plans");
      }
      const plans = (data.floorPlans || []).filter((p) => p.hasImage);
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
  const canSelect = selectedPlan?.scale?.metersPerPixel;

  return (
    <ModalBackdrop zIndex={2100}>
      <div
        style={{
          background: WHITE,
          borderRadius: "16px",
          padding: "24px",
          width: "min(920px, 94vw)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: "1.4rem", color: MONUMENT, fontWeight: 600 }}>
            Select floor plan
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: SECTION_GREY,
              color: MONUMENT,
              border: "none",
              borderRadius: "8px",
              padding: "10px 18px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>

        {error && (
          <div
            style={{
              color: "#842029",
              fontSize: "0.9rem",
              background: "#fdecea",
              padding: "8px 12px",
              borderRadius: "8px",
            }}
          >
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
              <div style={{ padding: "16px", color: "#666" }}>
                No floor plans available. Add plans in Maps Settings first.
              </div>
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
                        {!plan.scale && " · no scale"}
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
                <AuthenticatedPlanPreview planId={selectedPlan.id} alt={selectedPlan.name} />
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
                  {selectedPlan.scale ? (
                    <div>
                      <span style={{ color: "#666" }}>Scale: </span>
                      {selectedPlan.scale.meters} m reference line (
                      {selectedPlan.scale.metersPerPixel.toFixed(4)} m/px)
                    </div>
                  ) : (
                    <div style={{ color: "#842029", marginTop: "8px" }}>
                      This plan has no scale calibration and cannot be placed on the map.
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
                Select a floor plan
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: SECTION_GREY,
              color: MONUMENT,
              border: "none",
              borderRadius: "8px",
              padding: "10px 18px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSelect}
            onClick={() => canSelect && onSelect(selectedPlan)}
            style={{
              background: MONUMENT,
              color: WHITE,
              border: "none",
              borderRadius: "8px",
              padding: "10px 18px",
              cursor: canSelect ? "pointer" : "not-allowed",
              opacity: canSelect ? 1 : 0.5,
            }}
          >
            Place on map
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
