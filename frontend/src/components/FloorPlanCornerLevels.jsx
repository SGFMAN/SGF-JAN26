import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import {
  elevationPointsKey,
  fetchMonumentBox,
  formatAhdLabel,
  formatRelativeFallLabel,
  geometryCoordinatesKey,
  interpolateSiteCornerGrid,
  isVictoriaLatLng,
} from "../utils/floorPlanMap";

const LABEL_ICON_SIZE = [72, 42];

const CORNER_ANCHORS = {
  sw: { x: 0, y: LABEL_ICON_SIZE[1] },
  se: { x: LABEL_ICON_SIZE[0], y: LABEL_ICON_SIZE[1] },
  ne: { x: LABEL_ICON_SIZE[0], y: 0 },
  nw: { x: 0, y: 0 },
};

const FETCH_DEBOUNCE_MS = 300;

function escapeAttr(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function cornerLabelHtml(ahdText, relativeText = "", tooltip = "") {
  const titleAttr = tooltip ? ` title="${escapeAttr(tooltip)}"` : "";
  const relativeLine = relativeText
    ? `<div style="font: 600 11px/1.15 system-ui, sans-serif; color: #2563eb; margin-top: 2px;">${relativeText}</div>`
    : "";
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
  "><div>${ahdText}</div>${relativeLine}</div>`;
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
      html: cornerLabelHtml("…", "", "Loading floor plan levels…"),
      iconSize: LABEL_ICON_SIZE,
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

function setCornerMarkerText(marker, ahdText, relativeText = "", tooltip = "") {
  if (!marker) return;
  const cornerId = marker.options?.cornerId;
  const anchor = CORNER_ANCHORS[cornerId] || {
    x: LABEL_ICON_SIZE[0] / 2,
    y: LABEL_ICON_SIZE[1] / 2,
  };
  marker.setIcon(
    L.divIcon({
      className: "floor-plan-level-wrap",
      html: cornerLabelHtml(ahdText, relativeText, tooltip),
      iconSize: LABEL_ICON_SIZE,
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

function markAllCorners(markers, ahdText, relativeText, tooltip) {
  for (const marker of markers) {
    setCornerMarkerText(marker, ahdText, relativeText, tooltip);
  }
}

function applyCornerLabels(markers, unitPoints, siteCornerLevels) {
  const elevations = unitPoints.map((point) =>
    interpolateSiteCornerGrid(point.lat, point.lng, siteCornerLevels)
  );
  const highest = elevations.reduce((max, value) => {
    if (!Number.isFinite(value)) return max;
    return max == null || value > max ? value : max;
  }, null);

  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    const point = unitPoints[index];
    if (!marker || !point) continue;

    const ahdM = elevations[index];
    if (!Number.isFinite(ahdM) || highest == null) {
      setCornerMarkerText(
        marker,
        "—",
        "",
        "Could not interpolate level from site corner heights"
      );
      continue;
    }

    const ahdLabel = formatAhdLabel(ahdM);
    const relativeLabel = formatRelativeFallLabel(highest - ahdM);
    setCornerMarkerText(
      marker,
      ahdLabel,
      relativeLabel,
      `${ahdLabel} m AHD · ${relativeLabel} m below highest floor plan corner\n` +
        "Interpolated from site boundary corner levels"
    );
  }
}

function outOfRangeMessage(unitPoints) {
  const sample = unitPoints[0];
  return `Corner coordinates outside Victoria (${sample.lat.toFixed(5)}, ${sample.lng.toFixed(5)})`;
}

/** AHD + relative fall at floor plan corners — interpolated from site corner levels. */
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
  const siteCornerLevelsRef = useRef(null);
  const lastFetchedGeometryKeyRef = useRef("");
  const fetchTimerRef = useRef(null);
  const fetchAbortRef = useRef(null);
  const activeFetchKeyRef = useRef("");

  const geometryKey = useMemo(() => geometryCoordinatesKey(siteGeometry), [siteGeometry]);
  const unitPoints = Array.isArray(cornerPoints) ? cornerPoints : [];
  const cornerKey = useMemo(() => elevationPointsKey(unitPoints), [unitPoints]);

  useEffect(() => {
    return () => {
      window.clearTimeout(fetchTimerRef.current);
      fetchAbortRef.current?.abort();
      removeCornerLayer(mapRef.current, layerRef, markersRef);
    };
  }, []);

  useEffect(() => {
    const mapInstance = mapRef.current;

    if (!enabled || unitPoints.length === 0 || lookupState !== "VIC") {
      window.clearTimeout(fetchTimerRef.current);
      fetchAbortRef.current?.abort();
      removeCornerLayer(mapInstance, layerRef, markersRef);
      siteCornerLevelsRef.current = null;
      lastFetchedGeometryKeyRef.current = "";
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
      markAllCorners(markersRef.current, "—", "", outOfRangeMessage(unitPoints));
      return undefined;
    }

    const markers = markersRef.current;
    const hasSiteLevels =
      siteCornerLevelsRef.current &&
      lastFetchedGeometryKeyRef.current === geometryKey &&
      ["nw", "ne", "se", "sw"].every((id) => siteCornerLevelsRef.current?.[id]?.ahdM != null);

    if (hasSiteLevels) {
      applyCornerLabels(markers, unitPoints, siteCornerLevelsRef.current);
      return undefined;
    }

    if (!siteGeometry) {
      markAllCorners(markers, "—", "", "Site boundary required for floor plan levels");
      return undefined;
    }

    window.clearTimeout(fetchTimerRef.current);
    const delay = lastFetchedGeometryKeyRef.current === "" ? 0 : FETCH_DEBOUNCE_MS;

    fetchTimerRef.current = window.setTimeout(() => {
      fetchAbortRef.current?.abort();
      const controller = new AbortController();
      fetchAbortRef.current = controller;
      activeFetchKeyRef.current = geometryKey;

      markAllCorners(markers, "…", "", "Loading site corner levels…");

      (async () => {
        try {
          const data = await fetchMonumentBox(siteGeometry, lookupState, controller.signal);
          if (controller.signal.aborted || activeFetchKeyRef.current !== geometryKey) return;

          const levels = data.siteCornerLevels;
          const complete = levels && ["nw", "ne", "se", "sw"].every((id) => levels[id]?.ahdM != null);

          if (!complete) {
            const missing = data.missing?.length
              ? `Missing monuments: ${data.missing.join(", ").toUpperCase()}`
              : "Incomplete site corner levels";
            markAllCorners(markers, "—", "", missing);
            return;
          }

          siteCornerLevelsRef.current = levels;
          lastFetchedGeometryKeyRef.current = geometryKey;
          applyCornerLabels(markers, unitPoints, levels);
          layerRef.current?.bringToFront?.();
        } catch (err) {
          if (controller.signal.aborted) return;
          if (err?.name === "AbortError") {
            if (activeFetchKeyRef.current !== geometryKey) return;
            markAllCorners(markers, "—", "", "Level lookup timed out — try again");
            return;
          }
          console.warn("[FloorPlanCornerLevels] lookup failed:", err);
          if (activeFetchKeyRef.current !== geometryKey) return;
          markAllCorners(markers, "—", "", err.message || "Could not load floor plan levels");
        }
      })();
    }, delay);

    return () => {
      window.clearTimeout(fetchTimerRef.current);
    };
  }, [cornerKey, geometryKey, enabled, lookupState, siteGeometry, unitPoints]);

  return null;
}
