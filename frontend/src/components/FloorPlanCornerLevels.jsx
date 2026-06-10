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

const CORNER_OFFSETS = {
  sw: { x: 12, y: -12 },
  se: { x: -12, y: -12 },
  ne: { x: -12, y: 12 },
  nw: { x: 12, y: 12 },
};

function cornerLabelIcon(text, cornerId) {
  const offset = CORNER_OFFSETS[cornerId] || { x: 0, y: 0 };
  const html = `<div style="
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

  return L.divIcon({
    className: "",
    html,
    iconSize: [1, 1],
    iconAnchor: [-offset.x, -offset.y],
  });
}

/**
 * Fall labels at floor plan corners — 0 at site high point, 0.25 m steps below.
 */
export default function FloorPlanCornerLevels({
  bounds,
  siteGeometry = null,
  lookupState = "VIC",
  enabled = true,
}) {
  const map = useMap();
  const markersRef = useRef([]);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!enabled || !bounds || lookupState !== "VIC") {
      for (const marker of markersRef.current) {
        map.removeLayer(marker);
      }
      markersRef.current = [];
      return undefined;
    }

    let cancelled = false;
    const unitPoints = floorPlanCornerPoints(bounds);
    if (unitPoints.length === 0) return undefined;

    for (const marker of markersRef.current) {
      map.removeLayer(marker);
    }
    markersRef.current = unitPoints.map((point) => {
      const marker = L.marker([point.lat, point.lng], {
        icon: cornerLabelIcon("…", point.id),
        interactive: false,
        keyboard: false,
        zIndexOffset: 2600,
      });
      marker.addTo(map);
      marker.bringToFront?.();
      return marker;
    });

    const timerId = window.setTimeout(() => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      (async () => {
        try {
          const sitePoints = sampleSiteElevationPoints(siteGeometry);
          const siteRows =
            sitePoints.length > 0
              ? await fetchAhdElevationsBatched(sitePoints, lookupState)
              : [];
          const unitRows = await fetchAhdElevationsBatched(unitPoints, lookupState);

          if (cancelled || requestIdRef.current !== requestId) return;

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
              marker.setIcon(cornerLabelIcon("—", point.id));
              marker.setTitle("Level unavailable");
              return;
            }

            const fallM = siteMax - ahdM;
            const label = formatFallLabel(fallM);
            marker.setIcon(cornerLabelIcon(label, point.id));
            marker.setTitle(
              `Fall ${formatFallLabel(fallM)} m from site high point` +
                ` (site RL ${siteMax.toFixed(2)} m AHD, corner ${ahdM.toFixed(2)} m AHD` +
                `${row.approximate ? ", approximate" : ""})`
            );
            marker.bringToFront?.();
          });
        } catch (err) {
          if (cancelled || requestIdRef.current !== requestId) return;
          console.warn("[FloorPlanCornerLevels]", err);
          markersRef.current.forEach((marker, index) => {
            marker.setIcon(cornerLabelIcon("—", unitPoints[index].id));
            marker.setTitle("Could not load site levels");
          });
        }
      })();
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
      for (const marker of markersRef.current) {
        map.removeLayer(marker);
      }
      markersRef.current = [];
    };
  }, [
    bounds?.getSouthWest()?.lat,
    bounds?.getSouthWest()?.lng,
    bounds?.getNorthEast()?.lat,
    bounds?.getNorthEast()?.lng,
    siteGeometry,
    enabled,
    lookupState,
    map,
  ]);

  return null;
}
