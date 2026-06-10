import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

const EASEMENT_LINE_STYLE = {
  color: "#dc2626",
  weight: 1,
  opacity: 1,
};

const EASEMENT_POLYGON_STYLE = {
  color: "#b91c1c",
  weight: 1,
  fillColor: "#fca5a5",
  fillOpacity: 0.28,
};

function styleForEasementFeature(feature) {
  const geomType = feature?.geometry?.type;
  if (geomType === "Polygon" || geomType === "MultiPolygon") {
    return EASEMENT_POLYGON_STYLE;
  }
  return EASEMENT_LINE_STYLE;
}

function setLayerGroupPointerEvents(group, enabled) {
  if (!group) return;
  group.eachLayer((layer) => {
    const el = layer.getElement?.();
    if (el) el.style.pointerEvents = enabled ? "auto" : "none";
  });
}

export default function EasementsLayer({ easementsGeoJson, blockPointerEvents = false }) {
  const map = useMap();

  useEffect(() => {
    if (!easementsGeoJson?.features?.length) return undefined;

    let layerGroup = null;
    let cancelled = false;

    const frameId = requestAnimationFrame(() => {
      if (cancelled) return;
      try {
        layerGroup = L.geoJSON(easementsGeoJson, {
          style: styleForEasementFeature,
          onEachFeature: (feature, layer) => {
            const label = feature?.properties?.label;
            if (label) {
              layer.bindTooltip(label, { sticky: true, opacity: 0.92 });
            }
            layer.bringToFront?.();
          },
        });
        setLayerGroupPointerEvents(layerGroup, !blockPointerEvents);
        layerGroup.addTo(map);
        if (!blockPointerEvents) {
          layerGroup.bringToFront?.();
        }
      } catch (err) {
        console.error("[EasementsLayer] render failed:", err);
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      if (layerGroup) map.removeLayer(layerGroup);
    };
  }, [easementsGeoJson, blockPointerEvents, map]);

  return null;
}
