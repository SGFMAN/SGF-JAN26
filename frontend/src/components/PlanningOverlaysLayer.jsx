import { GeoJSON } from "react-leaflet";

export const PLANNING_VISIBILITY_ZONE = "zone";

const ZONE_STYLE = {
  color: "#16a34a",
  weight: 2,
  fillColor: "#4ade80",
  fillOpacity: 0.1,
  dashArray: "4 6",
};

const DEFAULT_OVERLAY_STYLE = {
  color: "#a855f7",
  weight: 2,
  fillColor: "#c084fc",
  fillOpacity: 0.12,
  dashArray: "6 4",
};

const WATER_OVERLAY_STYLE = {
  color: "#38bdf8",
  weight: 2,
  fillColor: "#7dd3fc",
  fillOpacity: 0.28,
  dashArray: "6 4",
};

function overlayFeatureProperties(feature) {
  return feature?.properties || {};
}

/** Significant Landscape Overlay or Special Building Overlay — shown as light blue (water). */
export function isWaterStyleOverlay(feature) {
  const p = overlayFeatureProperties(feature);
  const desc = String(p.overlay_description || "").toUpperCase();
  const scheme = String(p.scheme_code || "").toUpperCase();
  const code = String(p.overlay_code || "").toUpperCase();

  if (desc.includes("SIGNIFICANT LANDSCAPE OVERLAY")) return true;
  if (desc.includes("SPECIAL BUILDING OVERLAY")) return true;
  if (scheme === "SLO" || scheme === "SBO") return true;
  if (code.startsWith("SLO") || code.startsWith("SBO")) return true;

  return false;
}

function styleForOverlayFeature(feature) {
  return isWaterStyleOverlay(feature) ? WATER_OVERLAY_STYLE : DEFAULT_OVERLAY_STYLE;
}

export function overlayLayerKey(overlay) {
  return String(overlay?.code || overlay?.description || "").trim();
}

/** Default all zone + overlay layers hidden when planning data loads. */
export function buildInitialPlanningLayerVisibility(planningData) {
  const visibility = {};
  if (planningData?.planningZone || planningData?.zoneGeoJson?.features?.length) {
    visibility[PLANNING_VISIBILITY_ZONE] = false;
  }
  for (const overlay of planningData?.overlays || []) {
    const key = overlayLayerKey(overlay);
    if (key) visibility[key] = false;
  }
  return visibility;
}

function bindPlanningTooltip(layer, code, description) {
  if (code || description) {
    layer.bindTooltip([code, description].filter(Boolean).join(" — "), {
      sticky: true,
      opacity: 0.92,
    });
  }
}

export default function PlanningOverlaysLayer({
  zoneGeoJson,
  overlayGeoJson,
  layerVisibility = {},
}) {
  const showZone =
    layerVisibility[PLANNING_VISIBILITY_ZONE] === true && zoneGeoJson?.features?.length > 0;

  const visibleOverlayFeatures = (overlayGeoJson?.features || []).filter((feature) => {
    const code = feature?.properties?.overlay_code;
    const key = String(code || feature?.properties?.overlay_description || "").trim();
    return key && layerVisibility[key] === true;
  });

  if (!showZone && visibleOverlayFeatures.length === 0) return null;

  return (
    <>
      {showZone && (
        <GeoJSON
          key="planning-zone"
          data={zoneGeoJson}
          style={ZONE_STYLE}
          onEachFeature={(feature, layer) => {
            const code = feature?.properties?.zone_code;
            const desc = feature?.properties?.zone_description;
            bindPlanningTooltip(layer, code, desc);
          }}
        />
      )}
      {visibleOverlayFeatures.length > 0 && (
        <GeoJSON
          key={`planning-overlays-${visibleOverlayFeatures.length}-${visibleOverlayFeatures.map((f) => f.properties?.overlay_code).join(",")}`}
          data={{ type: "FeatureCollection", features: visibleOverlayFeatures }}
          style={styleForOverlayFeature}
          onEachFeature={(feature, layer) => {
            const code = feature?.properties?.overlay_code;
            const desc = feature?.properties?.overlay_description;
            bindPlanningTooltip(layer, code, desc);
          }}
        />
      )}
    </>
  );
}
