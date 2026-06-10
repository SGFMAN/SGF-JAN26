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

function labelBorderColor(surveyDistM) {
  if (surveyDistM == null) return "#15803d";
  if (surveyDistM > 50) return "#b91c1c";
  if (surveyDistM > 12) return "#b45309";
  return "#15803d";
}

function boundaryLabelHtml(text, tooltip = "", borderColor = "#15803d") {
  const titleAttr = tooltip ? ` title="${escapeAttr(tooltip)}"` : "";
  return `<div data-boundary-level-label${titleAttr} style="
    min-width: 44px;
    text-align: center;
    background: rgba(255,255,255,0.97);
    border: 2px solid ${borderColor};
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

function setBoundaryMarkerText(marker, text, tooltip = "", borderColor = "#15803d") {
  if (!marker) return;
  marker.setIcon(
    L.divIcon({
      className: "site-boundary-level-wrap",
      html: boundaryLabelHtml(text, tooltip, borderColor),
      iconSize: [80, 28],
      iconAnchor: [LABEL_ANCHOR.x, LABEL_ANCHOR.y],
    })
  );
  bindMarkerTooltip(marker, tooltip);
}

function removeBoundaryLayer(map, layerRef) {
  if (layerRef.current) {
    map.removeLayer(layerRef.current);
    layerRef.current = null;
  }
}

function readAhdM(row) {
  const raw = row?.ahdM;
  if (raw == null || raw === "") return NaN;
  const value = Number(raw);
  return Number.isFinite(value) ? value : NaN;
}

function rebuildMarkers(group, boundaryPoints) {
  const markers = boundaryPoints.map((point) => createBoundaryMarker(point));
  for (const marker of markers) {
    group.addLayer(marker);
  }
  return markers;
}

function markAllBoundaryPoints(markers, text, tooltip) {
  for (const marker of markers) {
    setBoundaryMarkerText(marker, text, tooltip);
  }
}

function addVertexPin(group, lat, lng) {
  const pin = L.circleMarker([lat, lng], {
    radius: 5,
    color: "#15803d",
    weight: 2,
    fillColor: "#86efac",
    fillOpacity: 0.95,
    interactive: false,
    zIndexOffset: 2650,
  });
  group.addLayer(pin);
}

function addSurveySourceLayers(group, boundaryLat, boundaryLng, row) {
  const surveyLat = Number(row?.surveyLat);
  const surveyLng = Number(row?.surveyLng);
  const surveyDistM = Number(row?.surveyDistM);
  if (!Number.isFinite(surveyLat) || !Number.isFinite(surveyLng)) return;

  addVertexPin(group, boundaryLat, boundaryLng);

  if (!Number.isFinite(surveyDistM) || surveyDistM <= 1) return;

  const line = L.polyline(
    [
      [boundaryLat, boundaryLng],
      [surveyLat, surveyLng],
    ],
    {
      color: "#b45309",
      weight: 2,
      opacity: 0.85,
      dashArray: "6 5",
      interactive: false,
    }
  );
  group.addLayer(line);

  const surveyMarker = L.circleMarker([surveyLat, surveyLng], {
    radius: 6,
    color: "#c2410c",
    weight: 2,
    fillColor: "#fdba74",
    fillOpacity: 0.95,
    interactive: true,
    zIndexOffset: 2640,
  });
  const surveyLabel = formatAhdLabel(readAhdM(row));
  surveyMarker.bindTooltip(
    `Vicmap survey monument\n${surveyLabel} m AHD\n${surveyLat.toFixed(5)}, ${surveyLng.toFixed(5)}`,
    { direction: "top", offset: [0, -6], opacity: 0.95 }
  );
  group.addLayer(surveyMarker);
}

function buildSurveyTooltip(point, row, label) {
  const dist = row?.surveyDistM;
  const count = row?.surveyCount;
  const rangeM = row?.surveyRangeM;
  const source = row?.source || "vicmap";

  let methodNote = "Interpolated from nearby Vicmap survey monuments.";
  if (source === "vicmap_idw_flat") {
    methodNote = `Locally flat patch (surveys within ${rangeM ?? "?"} m) — averaged ${count ?? "?"} nearby monuments.`;
  } else if (source === "vicmap_idw") {
    methodNote = `IDW interpolation from ${count ?? "?"} monuments within 450 m (range ${rangeM ?? "?"} m).`;
  } else if (source === "vicmap_nearest_survey") {
    methodNote = "Single nearest survey monument (no others in range).";
  }

  const distNote =
    dist != null
      ? dist <= 12
        ? `Nearest monument ${dist} m away.`
        : `Nearest monument ${dist} m away — estimate only.`
      : "";

  const surveyCoords =
    row?.surveyLat != null && row?.surveyLng != null
      ? `\nNearest monument: ${Number(row.surveyLat).toFixed(5)}, ${Number(row.surveyLng).toFixed(5)}`
      : "";

  return (
    `${point.id} boundary vertex: ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}\n` +
    `Estimated level: ${label} m AHD${surveyCoords}\n` +
    `${methodNote}\n${distNote}`
  );
}

function applyBoundaryLabels(group, markers, boundaryPoints, rows) {
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
    const borderColor = labelBorderColor(row?.surveyDistM);
    setBoundaryMarkerText(
      marker,
      label,
      buildSurveyTooltip(point, row, label),
      borderColor
    );
    addSurveySourceLayers(group, point.lat, point.lng, row);
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
      removeBoundaryLayer(mapRef.current, layerRef);
      markersRef.current = [];
    };
  }, []);

  useEffect(() => {
    const mapInstance = mapRef.current;

    if (!enabled || !boundaryPoints.length || lookupState !== "VIC") {
      window.clearTimeout(fetchTimerRef.current);
      fetchAbortRef.current?.abort();
      removeBoundaryLayer(mapInstance, layerRef);
      markersRef.current = [];
      lastFetchedKeyRef.current = "";
      activeFetchKeyRef.current = "";
      return undefined;
    }

    removeBoundaryLayer(mapInstance, layerRef);
    const group = L.layerGroup();
    markersRef.current = rebuildMarkers(group, boundaryPoints);
    group.addTo(mapInstance);
    group.bringToFront?.();
    layerRef.current = group;

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
      const groupInstance = layerRef.current;
      if (!markers.length || !groupInstance) return;

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
            "interpolate"
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

          applyBoundaryLabels(groupInstance, markers, boundaryPoints, rows);
          groupInstance.bringToFront?.();
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
