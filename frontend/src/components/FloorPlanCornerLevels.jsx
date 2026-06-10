import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import {
  elevationPointsKey,
  fetchAhdElevationsBatched,
  formatFallLabel,
  isVictoriaLatLng,
  sampleSiteElevationPoints,
  siteHighPointAhd,
} from "../utils/floorPlanMap";

const CORNER_ANCHORS = {
  sw: { x: 0, y: 26 },
  se: { x: 72, y: 26 },
  ne: { x: 72, y: 0 },
  nw: { x: 0, y: 0 },
};

const FETCH_DEBOUNCE_MS = 300;

function escapeAttr(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function cornerLabelHtml(text, tooltip = "") {
  const titleAttr = tooltip ? ` title="${escapeAttr(tooltip)}"` : "";
  return `<div data-level-label${titleAttr} style="
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
    pointer-events: auto;
    cursor: help;
  ">${text}</div>`;
}

function bindMarkerTooltip(marker, tooltip) {
  if (!marker || !tooltip) return;
  marker.unbindTooltip?.();
  marker.bindTooltip(tooltip, {
    permanent: false,
    direction: "top",
    offset: [0, -8],
    opacity: 0.95,
    className: "floor-plan-level-tooltip",
  });
}

function createCornerMarker(point) {
  const anchor = CORNER_ANCHORS[point.id] || { x: 36, y: 13 };
  const marker = L.marker([point.lat, point.lng], {
    icon: L.divIcon({
      className: "floor-plan-level-wrap",
      html: cornerLabelHtml("…", "Loading site levels…"),
      iconSize: [72, 26],
      iconAnchor: [anchor.x, anchor.y],
    }),
    interactive: true,
    keyboard: false,
    zIndexOffset: 2600,
    bubblingMouseEvents: false,
  });
  marker.options.cornerId = point.id;
  return marker;
}

function setCornerMarkerText(marker, text, tooltip = "") {
  if (!marker) return;
  const cornerId = marker.options?.cornerId;
  const anchor = CORNER_ANCHORS[cornerId] || { x: 36, y: 13 };
  marker.setIcon(
    L.divIcon({
      className: "floor-plan-level-wrap",
      html: cornerLabelHtml(text, tooltip),
      iconSize: [72, 26],
      iconAnchor: [anchor.x, anchor.y],
    })
  );
  bindMarkerTooltip(marker, tooltip);
}

function removeCornerLayer(map, layerRef, markersRef) {
  if (layerRef.current) {
    map.removeLayer(layerRef.current);
    layerRef.current = null;
  }
  markersRef.current = [];
}

function syncMarkerPositions(markers, unitPoints) {
  unitPoints.forEach((point, index) => {
    const marker = markers[index];
    if (marker) marker.setLatLng([point.lat, point.lng]);
  });
}

function readAhdM(row) {
  const raw = row?.ahdM;
  if (raw == null || raw === "") return NaN;
  const value = Number(raw);
  return Number.isFinite(value) ? value : NaN;
}

function countElevationHits(rows) {
  return rows.filter((row) => Number.isFinite(readAhdM(row))).length;
}

function unavailableReason(row, siteMax) {
  if (siteMax == null) {
    return "Could not determine site high point from Vicmap elevation data";
  }
  if (row?.error) return row.error;
  return "No elevation data for this corner from Vicmap";
}

function applyCornerLabels(markers, unitPoints, unitRows, siteMax) {
  const unitById = new Map(unitRows.map((row) => [String(row.id), row]));

  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    const point = unitPoints[index];
    if (!marker || !point) continue;

    try {
      const row = unitById.get(String(point.id));
      const ahdM = readAhdM(row);

      if (siteMax == null || !Number.isFinite(ahdM)) {
        setCornerMarkerText(marker, "—", unavailableReason(row, siteMax));
        continue;
      }

      const fallM = siteMax - ahdM;
      const label = formatFallLabel(fallM);
      setCornerMarkerText(
        marker,
        label,
        `Fall ${label} m from site high point` +
          ` (site ${siteMax.toFixed(2)} m AHD, corner ${ahdM.toFixed(2)} m AHD` +
          `${row?.approximate ? ", approximate" : ""})`
      );
    } catch (err) {
      console.warn("[FloorPlanCornerLevels] marker update:", point?.id, err);
      setCornerMarkerText(marker, "—", err.message || "Level unavailable");
    }
  }
}

function markAllCorners(markers, text, tooltip) {
  for (const marker of markers) {
    setCornerMarkerText(marker, text, tooltip);
  }
}

function splitElevationRows(rows, siteIds) {
  const siteRows = rows.filter((row) => siteIds.has(String(row.id)));
  const unitRows = rows.filter((row) => !siteIds.has(String(row.id)));
  return { siteRows, unitRows };
}

function outOfRangeMessage(unitPoints) {
  const sample = unitPoints[0];
  return `Corner coordinates outside Victoria (${sample.lat.toFixed(5)}, ${sample.lng.toFixed(5)})`;
}

/** Fall labels at floor plan corners — 0 at site high point, 0.25 m steps below. */
export default function FloorPlanCornerLevels({
  cornerPoints,
  siteGeometry = null,
  lookupState = "VIC",
  enabled = true,
}) {
  const map = useMap();
  const mapRef = useRef(map);
  mapRef.current = map;

  const layerRef = useRef(null);
  const markersRef = useRef([]);
  const lastFetchedKeyRef = useRef("");
  const fetchTimerRef = useRef(null);
  const fetchAbortRef = useRef(null);
  const activeFetchKeyRef = useRef("");
  const siteGeometryRef = useRef(siteGeometry);
  siteGeometryRef.current = siteGeometry;

  const sitePointsKey = useMemo(
    () => elevationPointsKey(sampleSiteElevationPoints(siteGeometry, 8)),
    [siteGeometry]
  );

  useEffect(() => {
    return () => {
      window.clearTimeout(fetchTimerRef.current);
      fetchAbortRef.current?.abort();
      removeCornerLayer(mapRef.current, layerRef, markersRef);
    };
  }, []);

  useEffect(() => {
    const mapInstance = mapRef.current;
    const unitPoints = Array.isArray(cornerPoints) ? cornerPoints : [];
    const key = elevationPointsKey(unitPoints);

    if (!enabled || unitPoints.length === 0 || lookupState !== "VIC") {
      window.clearTimeout(fetchTimerRef.current);
      fetchAbortRef.current?.abort();
      removeCornerLayer(mapInstance, layerRef, markersRef);
      lastFetchedKeyRef.current = "";
      activeFetchKeyRef.current = "";
      return undefined;
    }

    if (!layerRef.current) {
      const group = L.layerGroup();
      markersRef.current = unitPoints.map((point) => createCornerMarker(point));
      for (const marker of markersRef.current) {
        group.addLayer(marker);
      }
      group.addTo(mapInstance);
      group.bringToFront?.();
      layerRef.current = group;
    } else {
      syncMarkerPositions(markersRef.current, unitPoints);
      layerRef.current.bringToFront?.();
    }

    if (unitPoints.some((point) => !isVictoriaLatLng(point.lat, point.lng))) {
      markAllCorners(markersRef.current, "—", outOfRangeMessage(unitPoints));
      return undefined;
    }

    window.clearTimeout(fetchTimerRef.current);
    const delay = lastFetchedKeyRef.current === "" ? 0 : FETCH_DEBOUNCE_MS;

    fetchTimerRef.current = window.setTimeout(() => {
      const markers = markersRef.current;
      if (!markers.length) return;

      fetchAbortRef.current?.abort();
      const controller = new AbortController();
      fetchAbortRef.current = controller;
      activeFetchKeyRef.current = key;
      lastFetchedKeyRef.current = key;

      markAllCorners(markers, "…", "Loading site levels from Vicmap…");

      (async () => {
        try {
          const sitePoints = sampleSiteElevationPoints(siteGeometryRef.current, 8);
          const siteIds = new Set(sitePoints.map((point) => String(point.id)));
          const allPoints = [...sitePoints, ...unitPoints];

          const rows = await fetchAhdElevationsBatched(
            allPoints,
            lookupState,
            24,
            controller.signal
          );

          if (controller.signal.aborted || activeFetchKeyRef.current !== key) return;

          const { siteRows, unitRows } = splitElevationRows(rows, siteIds);
          const hits = countElevationHits(rows);

          let siteMax = siteHighPointAhd(siteRows);
          if (siteMax == null) {
            siteMax = siteHighPointAhd(rows);
          }

          if (hits === 0) {
            const sample = unitPoints[0];
            markAllCorners(
              markers,
              "—",
              `No Vicmap elevation returned for (${sample.lat.toFixed(5)}, ${sample.lng.toFixed(5)}). Check backend is running on port 3001.`
            );
            return;
          }

          applyCornerLabels(markers, unitPoints, unitRows, siteMax);
          layerRef.current?.bringToFront?.();
        } catch (err) {
          if (controller.signal.aborted) return;
          if (err?.name === "AbortError") {
            if (activeFetchKeyRef.current !== key) return;
            markAllCorners(markers, "—", "Elevation lookup timed out — try again");
            return;
          }
          console.warn("[FloorPlanCornerLevels] elevation lookup failed:", err);
          if (activeFetchKeyRef.current !== key) return;
          markAllCorners(
            markers,
            "—",
            err.message || "Could not load site levels"
          );
        }
      })();
    }, delay);

    return () => {
      window.clearTimeout(fetchTimerRef.current);
    };
  }, [elevationPointsKey(cornerPoints), sitePointsKey, enabled, lookupState]);

  return null;
}
