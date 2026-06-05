import { GeoJSON } from "react-leaflet";

const OVERLAY_STYLE = {
  color: "#a855f7",
  weight: 2,
  fillColor: "#c084fc",
  fillOpacity: 0.12,
  dashArray: "6 4",
};

export default function PlanningOverlaysLayer({ overlayGeoJson, visible }) {
  if (!visible || !overlayGeoJson?.features?.length) return null;

  return (
    <GeoJSON
      key={`planning-overlays-${overlayGeoJson.features.length}`}
      data={overlayGeoJson}
      style={OVERLAY_STYLE}
      onEachFeature={(feature, layer) => {
        const code = feature?.properties?.overlay_code;
        const desc = feature?.properties?.overlay_description;
        if (code || desc) {
          layer.bindTooltip([code, desc].filter(Boolean).join(" — "), {
            sticky: true,
            opacity: 0.92,
          });
        }
      }}
    />
  );
}
