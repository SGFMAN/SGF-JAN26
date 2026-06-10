import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

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

function featureCollection(data) {
  if (!data || !Array.isArray(data.features) || data.features.length === 0) return null;
  return { type: "FeatureCollection", features: data.features };
}

function setLayerGroupPointerEvents(group, enabled) {
  if (!group) return;
  group.eachLayer((layer) => {
    const el = layer.getElement?.();
    if (el) el.style.pointerEvents = enabled ? "auto" : "none";
  });
}

/** Planning zone/overlays rendered imperatively — avoids react-leaflet GeoJSON render crashes. */
export default function PlanningOverlaysLayer({
  zoneGeoJson,
  overlayGeoJson,
  layerVisibility = {},
  blockPointerEvents = false,
}) {
  const map = useMap();
  const zoneLayerRef = useRef(null);
  const overlayLayerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const frameId = requestAnimationFrame(() => {
      if (cancelled) return;

      if (zoneLayerRef.current) {
        map.removeLayer(zoneLayerRef.current);
        zoneLayerRef.current = null;
      }
      if (overlayLayerRef.current) {
        map.removeLayer(overlayLayerRef.current);
        overlayLayerRef.current = null;
      }

      const showZone =
        layerVisibility[PLANNING_VISIBILITY_ZONE] === true &&
        Array.isArray(zoneGeoJson?.features) &&
        zoneGeoJson.features.length > 0;

      if (showZone) {
        try {
          const zoneData = featureCollection(zoneGeoJson);
          if (zoneData) {
            const layer = L.geoJSON(zoneData, {
              style: ZONE_STYLE,
              onEachFeature: (feature, path) => {
                const code = feature?.properties?.zone_code;
                const desc = feature?.properties?.zone_description;
                bindPlanningTooltip(path, code, desc);
              },
            });
            layer.addTo(map);
            setLayerGroupPointerEvents(layer, !blockPointerEvents);
            zoneLayerRef.current = layer;
          }
        } catch (err) {
          console.error("[PlanningOverlaysLayer] zone render failed:", err);
        }
      }

      const overlayFeatures = (Array.isArray(overlayGeoJson?.features) ? overlayGeoJson.features : []).filter(
        (feature) => {
          const code = feature?.properties?.overlay_code;
          const key = String(code || feature?.properties?.overlay_description || "").trim();
          return key && layerVisibility[key] === true;
        }
      );

      if (overlayFeatures.length > 0) {
        try {
          const layer = L.geoJSON(
            { type: "FeatureCollection", features: overlayFeatures },
            {
              style: styleForOverlayFeature,
              onEachFeature: (feature, path) => {
                const code = feature?.properties?.overlay_code;
                const desc = feature?.properties?.overlay_description;
                bindPlanningTooltip(path, code, desc);
              },
            }
          );
          layer.addTo(map);
          setLayerGroupPointerEvents(layer, !blockPointerEvents);
          overlayLayerRef.current = layer;
        } catch (err) {
          console.error("[PlanningOverlaysLayer] overlay render failed:", err);
        }
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      if (zoneLayerRef.current) {
        map.removeLayer(zoneLayerRef.current);
        zoneLayerRef.current = null;
      }
      if (overlayLayerRef.current) {
        map.removeLayer(overlayLayerRef.current);
        overlayLayerRef.current = null;
      }
    };
  }, [zoneGeoJson, overlayGeoJson, layerVisibility, blockPointerEvents, map]);

  return null;
}
