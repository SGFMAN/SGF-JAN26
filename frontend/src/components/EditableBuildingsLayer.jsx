import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

export const BUILDINGS_PANE = "sgfBuildingsPane";

const BUILDING_POLYGON_STYLE = {
  color: "#ea580c",
  weight: 2,
  opacity: 1,
  fillColor: "#fb923c",
  fillOpacity: 0.38,
};

function ensureBuildingsPane(map) {
  if (!map.getPane(BUILDINGS_PANE)) {
    map.createPane(BUILDINGS_PANE);
    map.getPane(BUILDINGS_PANE).style.zIndex = "390";
  }
}

function vertexHandleIcon() {
  return L.divIcon({
    className: "sgf-building-vertex-handle",
    iconSize: [10, 10],
    iconAnchor: [5, 5],
    html: '<div style="width:10px;height:10px;border-radius:50%;background:#fff;border:2px solid #c2410c;box-sizing:border-box;cursor:grab;"></div>',
  });
}

function ringLatLngs(geometry) {
  if (geometry?.type === "Polygon") {
    const ring = geometry.coordinates?.[0];
    if (!ring?.length) return [];
    const points = ring.slice();
    if (points.length > 1) {
      const first = points[0];
      const last = points[points.length - 1];
      if (first[0] === last[0] && first[1] === last[1]) {
        points.pop();
      }
    }
    return points.map(([lng, lat]) => L.latLng(lat, lng));
  }
  return [];
}

function latLngsToPolygonGeometry(latlngs) {
  if (latlngs.length < 3) return null;
  const coords = latlngs.map(({ lat, lng }) => [lng, lat]);
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    coords.push([first[0], first[1]]);
  }
  return { type: "Polygon", coordinates: [coords] };
}

function rebuildFeatureCollection(sourceGeoJson, polygonGeometries) {
  const features = sourceGeoJson.features.map((feature, index) => ({
    ...feature,
    geometry: polygonGeometries[index] || feature.geometry,
  }));
  return {
    type: "FeatureCollection",
    features,
  };
}

export default function EditableBuildingsLayer({
  buildingsGeoJson,
  visible = true,
  blockPointerEvents = false,
  resetKey = 0,
  onBuildingsChange,
}) {
  const map = useMap();
  const onChangeRef = useRef(onBuildingsChange);
  onChangeRef.current = onBuildingsChange;

  useEffect(() => {
    if (!visible || !buildingsGeoJson?.features?.length) return undefined;

    let cancelled = false;
    let layerGroup = null;
    const polygonGeometries = buildingsGeoJson.features.map((feature) => feature.geometry);

    const emitChange = () => {
      if (cancelled) return;
      onChangeRef.current?.(rebuildFeatureCollection(buildingsGeoJson, polygonGeometries));
    };

    const frameId = requestAnimationFrame(() => {
      if (cancelled) return;
      try {
        ensureBuildingsPane(map);
        layerGroup = L.layerGroup([], { pane: BUILDINGS_PANE });

        buildingsGeoJson.features.forEach((feature, featureIndex) => {
          const latlngs = ringLatLngs(feature.geometry);
          if (latlngs.length < 3) return;

          const polygon = L.polygon(latlngs, {
            ...BUILDING_POLYGON_STYLE,
            pane: BUILDINGS_PANE,
            interactive: !blockPointerEvents,
          });

          const label = feature?.properties?.label || feature?.properties?.name;
          if (label) {
            polygon.bindTooltip(label, { sticky: true, opacity: 0.92 });
          }

          layerGroup.addLayer(polygon);

          if (!blockPointerEvents) {
            latlngs.forEach((latlng, vertexIndex) => {
              const marker = L.marker(latlng, {
                pane: BUILDINGS_PANE,
                draggable: true,
                icon: vertexHandleIcon(),
                zIndexOffset: 1000,
              });

              marker.on("drag", () => {
                const rings = polygon.getLatLngs();
                const ring = Array.isArray(rings[0]) ? [...rings[0]] : [...rings];
                ring[vertexIndex] = marker.getLatLng();
                polygon.setLatLngs(Array.isArray(rings[0]) ? [ring] : ring);
                const geometry = latLngsToPolygonGeometry(ring);
                if (geometry) polygonGeometries[featureIndex] = geometry;
              });

              marker.on("dragstart", () => {
                const el = marker.getElement()?.querySelector("div");
                if (el) el.style.cursor = "grabbing";
              });

              marker.on("dragend", () => {
                const el = marker.getElement()?.querySelector("div");
                if (el) el.style.cursor = "grab";
                emitChange();
              });

              layerGroup.addLayer(marker);
            });
          }
        });

        layerGroup.addTo(map);
      } catch (err) {
        console.error("[EditableBuildingsLayer] render failed:", err);
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      if (layerGroup) map.removeLayer(layerGroup);
    };
  }, [buildingsGeoJson, visible, blockPointerEvents, resetKey, map]);

  return null;
}
