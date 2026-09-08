import React, { useEffect, useMemo, useState } from "react";
import { getApiHeaders } from "../utils/auth";
import {
  DEFAULT_BUILDING_3D,
  normalizeBuilding3dDefaults,
} from "../constants/building3dDefaults";
import { computeProjectCostingQuantities } from "../utils/projectCostingQuantities";
import { UI } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const API_URL = "";

function formatMetres(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${v.toFixed(1)} m`;
}

function formatArea(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${v.toFixed(1)} m²`;
}

function openingSizeLabel(item) {
  if (item.widthMm == null || item.heightMm == null) return "—";
  return `${item.widthMm} × ${item.heightMm} mm`;
}

function Card({ title, children }) {
  return (
    <section
      style={{
        background: SECTION_GREY,
        borderRadius: "10px",
        padding: "16px 18px",
        marginBottom: "14px",
      }}
    >
      <h3
        style={{
          margin: "0 0 12px",
          fontSize: "1rem",
          fontWeight: 650,
          color: MONUMENT,
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, value }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: "16px",
        padding: "6px 0",
        borderBottom: `1px solid ${WHITE}`,
      }}
    >
      <span style={{ color: UI.textMuted, fontSize: "0.92rem" }}>{label}</span>
      <span style={{ color: PAGE_TEXT, fontWeight: 650, fontSize: "0.98rem" }}>{value}</span>
    </div>
  );
}

function footingLabel(type) {
  if (type === "mega_anchors") return "Mega-Anchors";
  if (type === "concrete_stumps") return "Concrete Stumps";
  return "Slab";
}

export default function Costing({ project }) {
  const [defaults, setDefaults] = useState(DEFAULT_BUILDING_3D);
  const [defaultsReady, setDefaultsReady] = useState(false);
  const [defaultsError, setDefaultsError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/building-3d-defaults`, {
          headers: getApiHeaders(),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setDefaultsError(data.error || "Could not load building defaults");
          setDefaultsReady(true);
          return;
        }
        setDefaults(normalizeBuilding3dDefaults(data.defaults));
        setDefaultsError(null);
        setDefaultsReady(true);
      } catch (e) {
        if (!cancelled) {
          setDefaults(DEFAULT_BUILDING_3D);
          setDefaultsError(e.message || "Could not load building defaults");
          setDefaultsReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const qty = useMemo(
    () => computeProjectCostingQuantities(project, defaults),
    [project, defaults]
  );

  const footingValue =
    qty.footing.type === "slab"
      ? formatArea(qty.footing.areaM2)
      : String(qty.footing.count);

  return (
    <div style={{ color: MONUMENT, maxWidth: "720px" }}>
      <h1 style={{ margin: "0 0 8px", fontSize: "1.45rem" }}>Costing</h1>
      <p style={{ margin: "0 0 18px", color: UI.textMuted, fontSize: "0.9rem" }}>
        Quantities from the traced plan and Colour Settings building defaults.
        {qty.hasPlan ? "" : " No traced plan yet — footprint uses the default unit size."}
      </p>
      {defaultsError && (
        <p style={{ color: "#cc3333", fontSize: "0.88rem", marginTop: 0 }}>
          {defaultsError}
        </p>
      )}
      {!defaultsReady ? (
        <p style={{ color: UI.textMuted }}>Loading quantities...</p>
      ) : (
        <>
          <Card title="Footing">
            <Row label={footingLabel(qty.footing.type)} value={footingValue} />
          </Card>

          {qty.usesDuragroove ? (
            <Card title="Duragroove">
              <Row label="Total" value={formatArea(qty.claddingArea.totalM2)} />
              <Row
                label="Without doors and windows"
                value={formatArea(qty.claddingArea.withoutOpeningsM2)}
              />
            </Card>
          ) : (
            <Card title="Weatherboards">
              <Row label="Lineal metres" value={formatMetres(qty.weatherboardMetres)} />
            </Card>
          )}

          <Card title="Frame timber">
            <Row label="Lineal metres" value={formatMetres(qty.frameTimberMetres)} />
            <Row
              label="Studs (2550)"
              value={String(qty.frameStock?.studs2550 ?? 0)}
            />
            <Row
              label="Plates (5400)"
              value={String(qty.frameStock?.plates5400 ?? 0)}
            />
            <Row
              label="Noggings"
              value={
                qty.frameStock?.noggingsExtra5400 > 0
                  ? `${qty.frameStock.noggingsExtra5400} extra 5400`
                  : "leftover"
              }
            />
          </Card>

          <Card title="Windows and doors">
            {qty.openings.length === 0 ? (
              <p style={{ margin: 0, color: UI.textMuted, fontSize: "0.92rem" }}>
                No windows or doors traced on this plan.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {qty.openings.map((item, index) => (
                  <Row
                    key={`${item.kind}-${index}`}
                    label={`${index + 1}. ${item.kind}`}
                    value={openingSizeLabel(item)}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card title="Flooring">
            <Row label="Hybrid" value={formatArea(qty.flooring.hybridM2)} />
            <Row label="Tiles" value={formatArea(qty.flooring.tilesM2)} />
            <Row label="Carpet" value={formatArea(qty.flooring.carpetM2)} />
          </Card>
        </>
      )}
    </div>
  );
}
