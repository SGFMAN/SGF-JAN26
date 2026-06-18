import { useCallback, useEffect, useRef, useState } from "react";
import FloorPlanDefine3DCanvas from "./FloorPlanDefine3DCanvas";
import ModalBackdrop from "./ModalBackdrop";
import { getApiHeaders } from "../utils/auth";

import { UI } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const SECTION_GREY = UI.panelBg;

const TOOL_BUTTONS = [
  { id: "external-walls", label: "External Walls" },
  { id: "internal-walls", label: "Internal Walls" },
  { id: "windows", label: "Windows" },
  { id: "doors", label: "Doors" },
  { id: "roof", label: "Roof" },
  { id: "porch", label: "Porch" },
  { id: "verandah", label: "Verandah" },
];

function menuButtonStyle(active, toolId) {
  const activeBg =
    toolId === "internal-walls" ? "#dcfce7" : toolId === "external-walls" ? "#fef9c3" : "#f3f4f6";
  return {
    width: "100%",
    textAlign: "left",
    padding: "11px 14px",
    fontSize: "0.92rem",
    fontWeight: 600,
    borderRadius: "8px",
    border: active ? `2px solid ${UI.outline}` : "1px solid #ddd",
    background: active ? activeBg : WHITE,
    color: MONUMENT,
    cursor: "pointer",
    flexShrink: 0,
  };
}

function wallsFromPlan(plan) {
  return {
    externalWallPolygons: plan?.define3d?.externalWallPolygons ?? [],
    internalWallSegments: plan?.define3d?.internalWallSegments ?? [],
  };
}

async function saveDefine3D(planId, payload) {
  const res = await fetch(`/api/maps/floor-plans/${planId}/define-3d`, {
    method: "PATCH",
    headers: {
      ...getApiHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Failed to save Define 3D data");
  }
  return data.floorPlan;
}

export default function FloorPlanDefine3DModal({ plan, onClose, onDefine3DUpdated }) {
  const [activeTool, setActiveTool] = useState(null);
  const [externalWallPolygons, setExternalWallPolygons] = useState([]);
  const [internalWallSegments, setInternalWallSegments] = useState([]);
  const [saveState, setSaveState] = useState("idle");
  const [saveError, setSaveError] = useState(null);
  const [closing, setClosing] = useState(false);
  const [imageSize, setImageSize] = useState(() => {
    const w = plan?.define3d?.imageWidth ?? plan?.imageWidth;
    const h = plan?.define3d?.imageHeight ?? plan?.imageHeight;
    return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? { width: w, height: h } : null;
  });

  const saveTimerRef = useRef(null);
  const skipSaveRef = useRef(true);
  const latestWallsRef = useRef({ externalWallPolygons: [], internalWallSegments: [] });
  const saveRequestRef = useRef(0);

  useEffect(() => {
    const walls = wallsFromPlan(plan);
    skipSaveRef.current = true;
    setExternalWallPolygons(walls.externalWallPolygons);
    setInternalWallSegments(walls.internalWallSegments);
    latestWallsRef.current = walls;
    setSaveState("idle");
    setSaveError(null);
    const w = plan?.define3d?.imageWidth ?? plan?.imageWidth;
    const h = plan?.define3d?.imageHeight ?? plan?.imageHeight;
    setImageSize(
      Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? { width: w, height: h } : null
    );
  }, [plan?.id]);

  latestWallsRef.current = { externalWallPolygons, internalWallSegments };

  const persistDefine3D = useCallback(
    async (external, internal) => {
      if (!plan?.id) return null;

      const requestId = saveRequestRef.current + 1;
      saveRequestRef.current = requestId;
      setSaveState("saving");
      setSaveError(null);

      try {
        const updatedPlan = await saveDefine3D(plan.id, {
          imageWidth: imageSize?.width ?? undefined,
          imageHeight: imageSize?.height ?? undefined,
          externalWallPolygons: external,
          internalWallSegments: internal,
        });
        if (saveRequestRef.current !== requestId) return updatedPlan;

        onDefine3DUpdated?.(updatedPlan);
        setSaveState("saved");
        return updatedPlan;
      } catch (err) {
        if (saveRequestRef.current !== requestId) return null;
        setSaveState("error");
        setSaveError(err.message || "Failed to save");
        return null;
      }
    },
    [plan?.id, onDefine3DUpdated, imageSize?.width, imageSize?.height]
  );

  useEffect(() => {
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return undefined;
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void persistDefine3D(externalWallPolygons, internalWallSegments);
    }, 600);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [externalWallPolygons, internalWallSegments, persistDefine3D]);

  if (!plan) return null;

  function handleToolClick(toolId) {
    setActiveTool((prev) => (prev === toolId ? null : toolId));
  }

  async function handleDone() {
    if (closing) return;
    setClosing(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    const { externalWallPolygons: external, internalWallSegments: internal } = latestWallsRef.current;
    await persistDefine3D(external, internal);
    onClose();
  }

  const saveLabel =
    saveState === "saving"
      ? "Saving…"
      : saveState === "saved"
        ? "Saved"
        : saveState === "error"
          ? "Save failed"
          : null;

  return (
    <ModalBackdrop
      zIndex={2200}
      style={{
        padding: "16px",
        boxSizing: "border-box",
        alignItems: "stretch",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="define-3d-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: WHITE,
          borderRadius: "16px",
          padding: "20px",
          width: "min(1180px, 100%)",
          height: "100%",
          maxHeight: "calc(100vh - 32px)",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
          overflow: "hidden",
          boxSizing: "border-box",
        }}
      >
        <div style={{ flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
            <h2 id="define-3d-title" style={{ margin: 0, fontSize: "1.25rem", color: MONUMENT }}>
              Define 3D — {plan.name}
            </h2>
            {saveLabel && (
              <span
                style={{
                  fontSize: "0.82rem",
                  color: saveState === "error" ? "#b91c1c" : SECTION_GREY,
                }}
              >
                {saveLabel}
              </span>
            )}
          </div>
          {saveError && (
            <p style={{ margin: "6px 0 0", fontSize: "0.82rem", color: "#b91c1c" }}>{saveError}</p>
          )}
          {activeTool === "external-walls" && (
            <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "#555", lineHeight: 1.45 }}>
              Click each corner of the external walls. Lines snap to 90° only. Click the green start
              point to close the shape. Drag nodes to edit · Right-click to delete · Esc cancels ·
              Backspace removes the last point.
            </p>
          )}
          {activeTool === "internal-walls" && (
            <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "#555", lineHeight: 1.45 }}>
              Click the start and end of each internal wall. Lines snap to 90° only. Draw as many
              segments as you need. Drag nodes to edit · Right-click to delete · Esc cancels the
              current line · Backspace removes the last point or segment.
            </p>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "200px minmax(0, 1fr)",
            gap: "16px",
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <nav
            aria-label="3D definition tools"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            {TOOL_BUTTONS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                style={menuButtonStyle(activeTool === id, id)}
                onClick={() => handleToolClick(id)}
              >
                {label}
              </button>
            ))}

            <div style={{ flex: 1, minHeight: "8px" }} />

            <button
              type="button"
              onClick={() => void handleDone()}
              disabled={closing}
              style={{
                ...menuButtonStyle(false, null),
                background: MONUMENT,
                color: WHITE,
                border: "none",
                opacity: closing ? 0.7 : 1,
              }}
            >
              {closing ? "Saving…" : "Done"}
            </button>
          </nav>

          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: "10px",
              padding: "12px",
              background: "#fafafa",
              minHeight: 0,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {plan.imageUrl ? (
              <FloorPlanDefine3DCanvas
                plan={plan}
                drawTool={activeTool}
                externalWallPolygons={externalWallPolygons}
                onExternalWallPolygonsChange={setExternalWallPolygons}
                internalWallSegments={internalWallSegments}
                onInternalWallSegmentsChange={setInternalWallSegments}
                onImageSize={(size) => setImageSize(size)}
              />
            ) : (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: SECTION_GREY,
                }}
              >
                No floor plan file available
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalBackdrop>
  );
}
