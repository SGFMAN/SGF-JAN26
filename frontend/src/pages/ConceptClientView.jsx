import React, { useEffect, useMemo, useRef, useState } from "react";
import QuickConcept3DPreview from "../components/QuickConcept3DPreview";
import sgfHomesLogo from "../images/SGF Homes.png";
import { UI } from "../utils/uiThemeTokens.js";
import {
  WALL_THICKNESS_M,
  bedroomBathroomInternalWalls,
  buildDesignExportCanvas,
  collectDesignDoors,
  formatSqm,
  insetPolygon,
  layoutFitWithDims,
  roomsWithPorchSteps,
} from "./QuickConcept.jsx";

const MONUMENT = UI.textPrimary;
const PAGE_TEXT = UI.pageText;

function planImageUrl(snapshot) {
  const metres = snapshot.metres;
  const rooms = snapshot.rooms;
  const layout = layoutFitWithDims(metres, rooms, 1400, 900);
  layout.eaveDepths = snapshot.eaveDepths;
  const canvas = buildDesignExportCanvas(layout, rooms, {
    mode: "color",
    dimensions: true,
    scale: 2,
    showAreaLabel: false,
    grid: false,
  });
  return canvas.toDataURL("image/png");
}

export default function ConceptClientView() {
  const walkRef = useRef(null);
  const [phase, setPhase] = useState("loading");
  const [error, setError] = useState("");
  const [view, setView] = useState(null);
  const [planUrl, setPlanUrl] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      const res = await fetch("/api/quick-concept/client-view", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "This view is no longer available");
      return data;
    }

    async function boot() {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");
      try {
        if (token) {
          const consumed = await fetch("/api/quick-concept/client-view/consume", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ token }),
          });
          const consumeData = await consumed.json().catch(() => ({}));
          if (!consumed.ok) {
            try {
              const existing = await loadSession();
              if (cancelled) return;
              window.history.replaceState({}, "", "/concept-client");
              setView(existing);
              setPhase("ready");
              return;
            } catch {
              throw new Error(consumeData.error || "This link has already been used");
            }
          }
          window.history.replaceState({}, "", "/concept-client");
        }
        const data = await loadSession();
        if (cancelled) return;
        setView(data);
        setPhase("ready");
      } catch (err) {
        if (cancelled) return;
        setError(err.message || "This link could not be opened");
        setPhase("error");
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!view?.metres?.length) return;
    try {
      setPlanUrl(planImageUrl(view));
    } catch (err) {
      console.error("[ConceptClient] plan image failed:", err);
      setPlanUrl("");
    }
  }, [view]);

  const scene = useMemo(() => {
    if (!view?.metres?.length) return null;
    const metres = view.metres;
    const rooms = roomsWithPorchSteps(view.rooms || [], metres);
    const innerMetres = insetPolygon(metres, WALL_THICKNESS_M);
    return {
      metres,
      rooms,
      innerMetres,
      walls: bedroomBathroomInternalWalls(view.rooms || [], innerMetres || metres),
      doors: collectDesignDoors(view.rooms || [], metres, innerMetres || metres),
      walk: view.walk || null,
      areaLabel: formatSqm(layoutFitWithDims(metres, view.rooms || [], 100, 100).areaM2),
    };
  }, [view]);

  const pageStyle = {
    minHeight: "100vh",
    background: "#f4f4f4",
    color: MONUMENT,
    padding: "28px 20px 48px",
    boxSizing: "border-box",
  };

  if (phase === "loading") {
    return (
      <div style={{ ...pageStyle, display: "flex", alignItems: "center", justifyContent: "center" }}>
        Opening your design…
      </div>
    );
  }

  if (phase === "error" || !scene) {
    return (
      <div style={{ ...pageStyle, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 420, textAlign: "center", lineHeight: 1.5 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>This link cannot be opened</div>
          <div>{error || "Ask SGF to send a new link."}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={{ width: "min(980px, 100%)", margin: "0 auto" }}>
        <img src={sgfHomesLogo} alt="SGF Homes" style={{ height: 64, width: "auto", marginBottom: 18 }} />
        <h1 style={{ margin: "0 0 6px", fontSize: "1.6rem", fontWeight: 700 }}>
          {view.address || "Your design"}
        </h1>
        <div style={{ marginBottom: 18, fontSize: "1.05rem" }}>{scene.areaLabel}</div>

        <section
          style={{
            background: "#fff",
            border: "1px solid #323233",
            borderRadius: 12,
            overflow: "hidden",
            marginBottom: 16,
          }}
        >
          <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 3", background: "#fff" }}>
            <QuickConcept3DPreview
              metres={scene.metres}
              rooms={scene.rooms}
              innerMetres={scene.innerMetres}
              walls={scene.walls}
              doors={scene.doors}
              walkRef={walkRef}
              walkRoute={scene.walk}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 14px", flexWrap: "wrap" }}>
            <div style={{ fontSize: "0.92rem" }}>Drag to turn the model.</div>
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => walkRef.current?.()}
              style={{
                background: MONUMENT,
                color: PAGE_TEXT,
                border: `1px solid ${MONUMENT}`,
                borderRadius: 8,
                padding: "8px 16px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Walk through
            </button>
          </div>
        </section>

        <section
          style={{
            background: "#fff",
            border: "1px solid #323233",
            borderRadius: 12,
            padding: 16,
          }}
        >
          {planUrl ? (
            <img src={planUrl} alt="Floor plan" style={{ width: "100%", height: "auto", display: "block" }} />
          ) : (
            <div style={{ padding: 24, textAlign: "center" }}>The plan could not be drawn.</div>
          )}
        </section>
      </div>
    </div>
  );
}
