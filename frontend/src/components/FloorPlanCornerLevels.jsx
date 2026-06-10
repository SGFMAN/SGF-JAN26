import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import {
  fetchAhdElevationsBatched,
  floorPlanCornerPoints,
  formatFallLabel,
  sampleSiteElevationPoints,
  siteHighPointAhd,
} from "../utils/floorPlanMap";

const CORNER_ANCHORS = {
  sw: { x: 0, y: 26 },
  se: { x: 72, y: 26 },
  ne: { x: 72, y: 0 },
  nw: { x: 0, y: 0 },
};

function boundsKey(bounds) {
  if (!bounds) return "";
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  return `${sw.lat.toFixed(6)},${sw.lng.toFixed(6)},${ne.lat.toFixed(6)},${ne.lng.toFixed(6)}`;
}

function cornerLabelHtml(text) {
  return `<div data-level-label style="
    min-width: 36px;
    text-align: center;
    background: rgba(255,255,255,0.96);
    border: 2px solid #1d4ed8;
    border-radius: 5px;
    padding: 3px 8px;
    font: 700 13px/1.2 system-ui, sans-serif;
    color: #1e3a8a;
    white-space: nowrap;
    box-shadow: 0 2px 6px rgba(0,0,0,0.22);
    pointer-events: none;
  ">${text}</div>`;
}

function createCornerMarker(point) {
  const anchor = CORNER_ANCHORS[point.id] || { x: 36, y: 13 };
  const marker = L.marker([point.lat, point.lng], {
    icon: L.divIcon({
      className: "floor-plan-level-wrap",
      html: cornerLabelHtml("…"),
      iconSize: [72, 26],
      iconAnchor: [anchor.x, anchor.y],
    }),
    interactive: false,
    keyboard: false,
    zIndexOffset: 2600,
  });
  marker.options.cornerId = point.id;
  return marker;
}

function setCornerMarkerText(marker, text) {
  const el = marker.getElement()?.querySelector("[data-level-label]");
  if (el) {
    el.textContent = text;
    return;
  }
  const cornerId = marker.options?.cornerId;
  const anchor = CORNER_ANCHORS[cornerId] || { x: 36, y: 13 };
  marker.setIcon(
    L.divIcon({
      className: "floor-plan-level-wrap",
      html: cornerLabelHtml(text),
      iconSize: [72, 26],
      iconAnchor: [anchor.x, anchor.y],
    })
  );
}

/** Fall labels at floor plan corners — 0 at site high point, 0.25 m steps below. */
export default function FloorPlanCornerLevels({
  bounds,
  siteGeometry = null,
  lookupState = "VIC",
  enabled = true,
}) {
  const map = useMap();
  const layerRef = useRef(null);
  const markersRef = useRef([]);
  const requestIdRef = useRef(0);
  const siteGeometryRef = useRef(siteGeometry);
  siteGeometryRef.current = siteGeometry;

  useEffect(() => {
    if (!enabled || !bounds || lookupState !== "VIC") {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
      markersRef.current = [];
      return undefined;
    }

    const unitPoints = floorPlanCornerPoints(bounds);
    if (unitPoints.length === 0) return undefined;

    if (layerRef.current) {
      map.removeLayer(layerRef.current);
    }
    const group = L.layerGroup();
    markersRef.current = unitPoints.map((point) => createCornerMarker(point));
    for (const marker of markersRef.current) {
      group.addLayer(marker);
    }
    group.addTo(map);
    group.bringToFront?.();
    layerRef.current = group;

    let cancelled = false;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    (async () => {
      try {
        const sitePoints = sampleSiteElevationPoints(siteGeometryRef.current, 8);
        const allPoints = [...sitePoints, ...unitPoints];
        const rows = await fetchAhdElevationsBatched(allPoints, lookupState, 16);

        if (cancelled || requestIdRef.current !== requestId) return;

        const siteIds = new Set(sitePoints.map((p) => p.id));
        const siteRows = rows.filter((row) => siteIds.has(row.id));
        const unitRows = rows.filter((row) => !siteIds.has(row.id));

        let siteMax = siteHighPointAhd(siteRows);
        if (siteMax == null) {
          siteMax = siteHighPointAhd(unitRows);
        }

        const unitById = new Map(unitRows.map((row) => [row.id, row]));

        markersRef.current.forEach((marker, index) => {
          const point = unitPoints[index];
          const row = unitById.get(point.id);
          const ahdM = Number(row?.ahdM);

          if (siteMax == null || !Number.isFinite(ahdM)) {
            setCornerMarkerText(marker, "—");
            marker.setTitle("Level unavailable");
            return;
          }

          const fallM = siteMax - ahdM;
          const label = formatFallLabel(fallM);
          setCornerMarkerText(marker, label);
          marker.setTitle(
            `Fall ${label} m from site high point` +
              ` (site ${siteMax.toFixed(2)} m AHD, corner ${ahdM.toFixed(2)} m AHD` +
              `${row.approximate ? ", approximate" : ""})`
          );
        });
        layerRef.current?.bringToFront?.();
      } catch (err) {
        if (cancelled || requestIdRef.current !== requestId) return;
        console.warn("[FloorPlanCornerLevels]", err);
        markersRef.current.forEach((marker) => {
          setCornerMarkerText(marker, "—");
          marker.setTitle(err.message || "Could not load site levels");
        });
      }
    })();

    return () => {
      cancelled = true;
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
      markersRef.current = [];
    };
  }, [boundsKey(bounds), enabled, lookupState, map]);

  return null;
}
