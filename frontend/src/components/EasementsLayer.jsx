import { GeoJSON } from "react-leaflet";

const EASEMENT_LINE_STYLE = {
  color: "#c026d3",
  weight: 4,
  opacity: 1,
};

const EASEMENT_POLYGON_STYLE = {
  color: "#a21caf",
  weight: 3,
  fillColor: "#e879f9",
  fillOpacity: 0.35,
};

function styleForEasementFeature(feature) {
  const geomType = feature?.geometry?.type;
  if (geomType === "Polygon" || geomType === "MultiPolygon") {
    return EASEMENT_POLYGON_STYLE;
  }
  return EASEMENT_LINE_STYLE;
}

export default function EasementsLayer({ easementsGeoJson, visible = false }) {
  if (!visible || !easementsGeoJson?.features?.length) return null;

  return (
    <GeoJSON
      key={`easements-${easementsGeoJson.features.length}-${easementsGeoJson.features.map((f) => f.properties?.object_id).join(",")}`}
      data={easementsGeoJson}
      style={styleForEasementFeature}
      onEachFeature={(feature, layer) => {
        const label = feature?.properties?.label;
        if (label) {
          layer.bindTooltip(label, { sticky: true, opacity: 0.92 });
        }
        layer.bringToFront?.();
      }}
      eventHandlers={{
        add: (event) => {
          event.target.bringToFront?.();
        },
      }}
    />
  );
}
