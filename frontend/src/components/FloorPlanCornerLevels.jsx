import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import {
  fetchAhdElevations,
  floorPlanCornerPoints,
  formatAhdLabel,
} from "../utils/floorPlanMap";

const CORNER_OFFSETS = {
  sw: { x: 10, y: -10 },
  se: { x: -10, y: -10 },
  ne: { x: -10, y: 10 },
  nw: { x: 10, y: 10 },
};

function cornerLabelIcon(text, cornerId) {
  const offset = CORNER_OFFSETS[cornerId] || { x: 0, y: 0 };
  const html = `<div style="
    background: rgba(255,255,255,0.94);
    border: 1px solid #2563eb;
    border-radius: 4px;
    padding: 2px 6px;
    font: 600 11px/1.2 system-ui, sans-serif;
    color: #1e3a8a;
    white-space: nowrap;
    box-shadow: 0 1px 4px rgba(0,0,0,0.18);
    pointer-events: none;
  ">${text}</div>`;

  return L.divIcon({
    className: "",
    html,
    iconSize: [1, 1],
    iconAnchor: [-offset.x, -offset.y],
  });
}

/** AHD level labels at the four corners of a floor plan bounds rectangle. */
export default function FloorPlanCornerLevels({ bounds, lookupState = "VIC", enabled = true }) {
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
    const points = floorPlanCornerPoints(bounds);
    if (points.length === 0) return undefined;

    for (const marker of markersRef.current) {
      map.removeLayer(marker);
    }
    markersRef.current = points.map((point) => {
      const marker = L.marker([point.lat, point.lng], {
        icon: cornerLabelIcon("RL …", point.id),
        interactive: false,
        keyboard: false,
        zIndexOffset: 2400,
      });
      marker.addTo(map);
      return marker;
    });

    const timerId = window.setTimeout(() => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      (async () => {
        try {
          const data = await fetchAhdElevations(points, lookupState);
          if (cancelled || requestIdRef.current !== requestId) return;

          const byId = new Map((data.elevations || []).map((row) => [row.id, row]));
          markersRef.current.forEach((marker, index) => {
            const point = points[index];
            const row = byId.get(point.id);
            const label = formatAhdLabel(row?.ahdM, { approximate: row?.approximate });
            const title = row?.ahdM != null
              ? `AHD ${Number(row.ahdM).toFixed(2)} m${row.approximate ? " (approximate)" : ""}`
              : "AHD elevation unavailable";
            marker.setIcon(cornerLabelIcon(label, point.id));
            marker.setTitle(title);
          });
        } catch (err) {
          if (cancelled || requestIdRef.current !== requestId) return;
          console.warn("[FloorPlanCornerLevels]", err);
          markersRef.current.forEach((marker, index) => {
            marker.setIcon(cornerLabelIcon("RL —", points[index].id));
            marker.setTitle("Could not load AHD elevation");
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
    enabled,
    lookupState,
    map,
  ]);

  return null;
}
