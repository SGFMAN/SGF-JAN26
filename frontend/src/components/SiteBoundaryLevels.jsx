import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import {
  allSiteBoundaryPoints,
  elevationPointsKey,
  fetchAhdElevationsBatched,
  formatAhdLabel,
  isVictoriaLatLng,
} from "../utils/floorPlanMap";

const FETCH_DEBOUNCE_MS = 300;
const LABEL_ANCHOR = { x: 40, y: 28 };

function escapeAttr(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function boundaryLabelHtml(text, tooltip = "") {
  const titleAttr = tooltip ? ` title="${escapeAttr(tooltip)}"` : "";
  return `<div data-boundary-level-label${titleAttr} style="
    min-width: 44px;
    text-align: center;
    background: rgba(255,255,255,0.97);
    border: 2px solid #15803d;
    border-radius: 5px;
    padding: 3px 8px;
    font: 700 12px/1.2 system-ui, sans-serif;
    color: #14532d;
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
    className: "site-boundary-level-tooltip",
  });
}

function createBoundaryMarker(point) {
  const marker = L.marker([point.lat, point.lng], {
    icon: L.divIcon({
      className: "site-boundary-level-wrap",
      html: boundaryLabelHtml("…", "Loading boundary level…"),
      iconSize: [80, 28],
      iconAnchor: [LABEL_ANCHOR.x, LABEL_ANCHOR.y],
    }),
    interactive: true,
    keyboard: false,
    zIndexOffset: 2700,
    bubblingMouseEvents: false,
  });
  marker.options.boundaryPointId = point.id;
  return marker;
}

function setBoundaryMarkerText(marker, text, tooltip = "") {
  if (!marker) return;
  marker.setIcon(
    L.divIcon({
      className: "site-boundary-level-wrap",
      html: boundaryLabelHtml(text, tooltip),
      iconSize: [80, 28],
      iconAnchor: [LABEL_ANCHOR.x, LABEL_ANCHOR.y],
    })
  );
  bindMarkerTooltip(marker, tooltip);
}

function removeBoundaryLayer(map, layerRef, markersRef) {
  if (layerRef.current) {
    map.removeLayer(layerRef.current);
    layerRef.current = null;
  }
  markersRef.current = [];
}

function readAhdM(row) {
  const raw = row?.ahdM;
  if (raw == null || raw === "") return NaN;
  const value = Number(raw);
  return Number.isFinite(value) ? value : NaN;
}

function rebuildMarkers(mapInstance, layerRef, markersRef, boundaryPoints) {
  removeBoundaryLayer(mapInstance, layerRef, markersRef);
  const group = L.layerGroup();
  markersRef.current = boundaryPoints.map((point) => createBoundaryMarker(point));
  for (const marker of markersRef.current) {
    group.addLayer(marker);
  }
  group.addTo(mapInstance);
  group.bringToFront?.();
  layerRef.current = group;
}

function markAllBoundaryPoints(markers, text, tooltip) {
  for (const marker of markers) {
    setBoundaryMarkerText(marker, text, tooltip);
  }
}

function applyBoundaryLabels(markers, boundaryPoints, rows) {
  const rowById = new Map(rows.map((row) => [String(row.id), row]));

  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    const point = boundaryPoints[index];
    if (!marker || !point) continue;

    const row = rowById.get(String(point.id));
    const ahdM = readAhdM(row);

    if (!Number.isFinite(ahdM)) {
      setBoundaryMarkerText(
        marker,
        "—",
        row?.error || `No Vicmap elevation at ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`
      );
      continue;
    }

    const label = formatAhdLabel(ahdM);
    const distNote =
      row?.surveyDistM != null ? `, nearest survey ${row.surveyDistM} m away` : "";
    setBoundaryMarkerText(
      marker,
      label,
      `${point.id}: ${label} m AHD at ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` +
        ` (${row?.source || "vicmap"}${row?.approximate ? ", approximate" : ""}${distNote})`
    );
  }
}

/** Debug: AHD height labels at each title-boundary vertex. */
export default function SiteBoundaryLevels({
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

  const boundaryPoints = useMemo(
    () => allSiteBoundaryPoints(siteGeometry),
    [siteGeometry]
  );
  const boundaryKey = useMemo(() => elevationPointsKey(boundaryPoints), [boundaryPoints]);

  useEffect(() => {
    return () => {
      window.clearTimeout(fetchTimerRef.current);
      fetchAbortRef.current?.abort();
      removeBoundaryLayer(mapRef.current, layerRef, markersRef);
    };
  }, []);

  useEffect(() => {
    const mapInstance = mapRef.current;

    if (!enabled || !boundaryPoints.length || lookupState !== "VIC") {
      window.clearTimeout(fetchTimerRef.current);
      fetchAbortRef.current?.abort();
      removeBoundaryLayer(mapInstance, layerRef, markersRef);
      lastFetchedKeyRef.current = "";
      activeFetchKeyRef.current = "";
      return undefined;
    }

    rebuildMarkers(mapInstance, layerRef, markersRef, boundaryPoints);

    if (boundaryPoints.some((point) => !isVictoriaLatLng(point.lat, point.lng))) {
      markAllBoundaryPoints(
        markersRef.current,
        "—",
        "Boundary coordinates outside Victoria"
      );
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
      activeFetchKeyRef.current = boundaryKey;
      lastFetchedKeyRef.current = boundaryKey;

      markAllBoundaryPoints(markers, "…", "Loading boundary levels from Vicmap…");

      (async () => {
        try {
          const rows = await fetchAhdElevationsBatched(
            boundaryPoints,
            lookupState,
            24,
            controller.signal,
            "survey"
          );

          if (controller.signal.aborted || activeFetchKeyRef.current !== boundaryKey) return;

          const hits = rows.filter((row) => Number.isFinite(readAhdM(row))).length;
          if (hits === 0) {
            const sample = boundaryPoints[0];
            markAllBoundaryPoints(
              markers,
              "—",
              `No Vicmap elevation for boundary (${sample.lat.toFixed(5)}, ${sample.lng.toFixed(5)}). Check backend on port 3001.`
            );
            return;
          }

          applyBoundaryLabels(markers, boundaryPoints, rows);
          layerRef.current?.bringToFront?.();
        } catch (err) {
          if (controller.signal.aborted) return;
          if (err?.name === "AbortError") {
            if (activeFetchKeyRef.current !== boundaryKey) return;
            markAllBoundaryPoints(markers, "—", "Elevation lookup timed out — try again");
            return;
          }
          console.warn("[SiteBoundaryLevels] elevation lookup failed:", err);
          if (activeFetchKeyRef.current !== boundaryKey) return;
          markAllBoundaryPoints(markers, "—", err.message || "Could not load boundary levels");
        }
      })();
    }, delay);

    return () => {
      window.clearTimeout(fetchTimerRef.current);
    };
  }, [boundaryKey, boundaryPoints, enabled, lookupState]);

  return null;
}
