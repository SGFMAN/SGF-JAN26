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

function sanitizeEasements(data) {
  if (!data?.features?.length) return null;
  const features = data.features.filter((f) => {
    if (!f?.geometry?.type) return false;
    const coords = f.geometry.coordinates;
    return Array.isArray(coords) && coords.length > 0;
  });
  if (!features.length) return null;
  return { type: "FeatureCollection", features };
}

/** Vicmap easements rendered imperatively so bad features cannot crash the map page. */
export default function EasementsLayer({ easementsGeoJson }) {
  const map = useMap();

  useEffect(() => {
    const data = sanitizeEasements(easementsGeoJson);
    if (!data) return undefined;

    let layerGroup = null;
    try {
      layerGroup = L.geoJSON(data, {
        style: styleForEasementFeature,
        onEachFeature: (feature, layer) => {
          const label = feature?.properties?.label;
          if (label) {
            layer.bindTooltip(label, { sticky: true, opacity: 0.92 });
          }
          layer.bringToFront?.();
        },
      });
      layerGroup.addTo(map);
      layerGroup.bringToFront?.();
    } catch (err) {
      console.error("[EasementsLayer] render failed:", err);
    }

    return () => {
      if (layerGroup) map.removeLayer(layerGroup);
    };
  }, [easementsGeoJson, map]);

  return null;
}
