import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import {
  allSiteBoundaryPoints,
  elevationPointsKey,
  fetchAhdInterpolationContext,
  formatAhdLabel,
  isVictoriaLatLng,
  siteBoundaryRingLatLng,
} from "../utils/floorPlanMap";

const FETCH_DEBOUNCE_MS = 300;
const QUAD_ORDER = ["sw", "se", "ne", "nw"];

const MONUMENT_STYLES = {
  sw: { label: "SW", color: "#7c3aed", fill: "#c4b5fd" },
  se: { label: "SE", color: "#2563eb", fill: "#93c5fd" },
  ne: { label: "NE", color: "#059669", fill: "#6ee7b7" },
  nw: { label: "NW", color: "#d97706", fill: "#fdba74" },
};

const METHOD_LABELS = {
  bilinear: "Bilinear (4 monuments)",
  idw: "IDW from nearby monuments",
  idw_flat: "Averaged nearby monuments",
  nearest: "Nearest monument",
  none: "No monuments found",
};

function escapeAttr(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function monumentLabelHtml(cornerId, ahdM, subtitle = "", tooltip = "") {
  const style = MONUMENT_STYLES[cornerId] || { label: cornerId.toUpperCase(), color: "#9333ea", fill: "#e9d5ff" };
  const titleAttr = tooltip ? ` title="${escapeAttr(tooltip)}"` : "";
  const ahdLabel = formatAhdLabel(ahdM);
  const subtitleLine = subtitle
    ? `<div style="font: 600 9px/1.1 system-ui, sans-serif; opacity:0.85; margin-top:2px;">${subtitle}</div>`
    : "";
  return `<div data-monument-label${titleAttr} style="
    text-align: center;
    background: rgba(255,255,255,0.98);
    border: 2px solid ${style.color};
    border-radius: 6px;
    padding: 4px 8px;
    font: 700 11px/1.2 system-ui, sans-serif;
    color: ${style.color};
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0,0,0,0.28);
    pointer-events: auto;
    cursor: help;
  ">
    <div style="font-size:10px; letter-spacing:0.04em; opacity:0.9;">MON ${style.label}</div>
    <div style="font-size:13px; margin-top:1px;">${ahdLabel}</div>
    ${subtitleLine}
  </div>`;
}

function idwLabelHtml(index, ahdM, distM, tooltip = "") {
  const titleAttr = tooltip ? ` title="${escapeAttr(tooltip)}"` : "";
  const ahdLabel = formatAhdLabel(ahdM);
  return `<div data-monument-label${titleAttr} style="
    text-align: center;
    background: rgba(255,255,255,0.97);
    border: 2px solid #64748b;
    border-radius: 5px;
    padding: 3px 6px;
    font: 700 10px/1.2 system-ui, sans-serif;
    color: #475569;
    white-space: nowrap;
    box-shadow: 0 1px 5px rgba(0,0,0,0.2);
    pointer-events: auto;
    cursor: help;
  ">
    <div style="font-size:9px; opacity:0.85;">IDW #${index + 1}</div>
    <div style="font-size:12px;">${ahdLabel}</div>
    <div style="font-size:9px; opacity:0.75;">${distM} m</div>
  </div>`;
}

function bindMarkerTooltip(marker, tooltip) {
  if (!marker || !tooltip) return;
  marker.unbindTooltip?.();
  marker.bindTooltip(tooltip, {
    permanent: false,
    direction: "top",
    offset: [0, -10],
    opacity: 0.96,
    className: "elevation-monument-tooltip",
  });
}

function removeLayer(map, layerRef) {
  if (layerRef.current) {
    map.removeLayer(layerRef.current);
    layerRef.current = null;
  }
}

function monumentKey(lat, lng) {
  return `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
}

function quadMonumentTooltip(cornerId, monument, method, groundSurveyCount, usedForInterpolation) {
  const style = MONUMENT_STYLES[cornerId] || { label: cornerId.toUpperCase() };
  const role = usedForInterpolation
    ? `${style.label} corner — used for bilinear interpolation`
    : `${style.label} corner — nearest in quadrant (bilinear unavailable)`;
  return (
    `${role}\n` +
    `${monument.lat.toFixed(6)}, ${monument.lng.toFixed(6)}\n` +
    `${formatAhdLabel(monument.ahdM)} m AHD\n` +
    `Method: ${METHOD_LABELS[method] || method}\n` +
    `${groundSurveyCount ?? "?"} monuments searched nearby`
  );
}

function renderSiteBoundary(group, siteGeometry) {
  const ring = siteBoundaryRingLatLng(siteGeometry);
  if (ring.length < 3) return;

  const boundary = L.polygon(ring, {
    color: "#15803d",
    weight: 2,
    opacity: 0.9,
    dashArray: "6 4",
    fillColor: "#86efac",
    fillOpacity: 0.08,
    interactive: false,
  });
  group.addLayer(boundary);
}

function renderQuadMonuments(group, quad, method, groundSurveyCount, usedForInterpolation) {
  const positions = [];
  const drawnKeys = new Set();

  for (const cornerId of QUAD_ORDER) {
    const monument = quad[cornerId];
    if (!monument || !Number.isFinite(monument.lat) || !Number.isFinite(monument.lng)) continue;

    positions.push([monument.lat, monument.lng]);
    drawnKeys.add(monumentKey(monument.lat, monument.lng));

    const subtitle = usedForInterpolation ? "bilinear" : "candidate";
    const tooltip = quadMonumentTooltip(cornerId, monument, method, groundSurveyCount, usedForInterpolation);

    const pin = L.circleMarker([monument.lat, monument.lng], {
      radius: 7,
      color: MONUMENT_STYLES[cornerId]?.color || "#9333ea",
      weight: 3,
      fillColor: MONUMENT_STYLES[cornerId]?.fill || "#e9d5ff",
      fillOpacity: 0.95,
      interactive: false,
      zIndexOffset: 2850,
    });
    group.addLayer(pin);

    const marker = L.marker([monument.lat, monument.lng], {
      icon: L.divIcon({
        className: "elevation-monument-wrap",
        html: monumentLabelHtml(cornerId, monument.ahdM, subtitle, tooltip),
        iconSize: [64, 46],
        iconAnchor: [32, 50],
      }),
      interactive: true,
      keyboard: false,
      zIndexOffset: 2900,
      bubblingMouseEvents: false,
    });
    bindMarkerTooltip(marker, tooltip);
    group.addLayer(marker);
  }

  if (positions.length === 4) {
    const ring = [...positions, positions[0]];
    const quadLine = L.polyline(ring, {
      color: usedForInterpolation ? "#9333ea" : "#ea580c",
      weight: 2,
      opacity: usedForInterpolation ? 0.85 : 0.7,
      dashArray: usedForInterpolation ? "8 6" : "4 6",
      interactive: false,
    });
    group.addLayer(quadLine);

    const quadFill = L.polygon(positions, {
      color: usedForInterpolation ? "#9333ea" : "#ea580c",
      weight: 1,
      opacity: 0.45,
      fillColor: usedForInterpolation ? "#c084fc" : "#fdba74",
      fillOpacity: usedForInterpolation ? 0.12 : 0.06,
      interactive: false,
    });
    group.addLayer(quadFill);
  }

  return drawnKeys;
}

function renderIdwContributors(group, contributors, method, skipKeys) {
  if (!Array.isArray(contributors) || contributors.length === 0) return;

  contributors.forEach((monument, index) => {
    const key = monumentKey(monument.lat, monument.lng);
    if (skipKeys.has(key)) return;

    const tooltip =
      `IDW contributor #${index + 1}\n` +
      `${monument.lat.toFixed(6)}, ${monument.lng.toFixed(6)}\n` +
      `${formatAhdLabel(monument.ahdM)} m AHD · ${monument.distM ?? "?"} m from site centre\n` +
      `Method: ${METHOD_LABELS[method] || method}`;

    const pin = L.circleMarker([monument.lat, monument.lng], {
      radius: 5,
      color: "#64748b",
      weight: 2,
      fillColor: "#cbd5e1",
      fillOpacity: 0.95,
      interactive: false,
      zIndexOffset: 2800,
    });
    group.addLayer(pin);

    const marker = L.marker([monument.lat, monument.lng], {
      icon: L.divIcon({
        className: "elevation-monument-wrap",
        html: idwLabelHtml(index, monument.ahdM, monument.distM ?? "?", tooltip),
        iconSize: [52, 44],
        iconAnchor: [26, 48],
      }),
      interactive: true,
      keyboard: false,
      zIndexOffset: 2880,
      bubblingMouseEvents: false,
    });
    bindMarkerTooltip(marker, tooltip);
    group.addLayer(marker);
  });
}

/** Debug: Vicmap monuments used (or nearest candidates) for site AHD interpolation. */
export default function ElevationInterpolationMonuments({
  siteGeometry = null,
  lookupState = "VIC",
  enabled = true,
}) {
  const map = useMap();
  const mapRef = useRef(map);
  mapRef.current = map;

  const layerRef = useRef(null);
  const lastFetchedKeyRef = useRef("");
  const fetchTimerRef = useRef(null);
  const fetchAbortRef = useRef(null);
  const activeFetchKeyRef = useRef("");

  const sitePoints = useMemo(
    () => allSiteBoundaryPoints(siteGeometry),
    [siteGeometry]
  );
  const siteKey = useMemo(() => elevationPointsKey(sitePoints), [sitePoints]);

  useEffect(() => {
    return () => {
      window.clearTimeout(fetchTimerRef.current);
      fetchAbortRef.current?.abort();
      removeLayer(mapRef.current, layerRef);
    };
  }, []);

  useEffect(() => {
    const mapInstance = mapRef.current;

    if (!enabled || !sitePoints.length || lookupState !== "VIC") {
      window.clearTimeout(fetchTimerRef.current);
      fetchAbortRef.current?.abort();
      removeLayer(mapInstance, layerRef);
      lastFetchedKeyRef.current = "";
      activeFetchKeyRef.current = "";
      return undefined;
    }

    if (sitePoints.some((point) => !isVictoriaLatLng(point.lat, point.lng))) {
      removeLayer(mapInstance, layerRef);
      return undefined;
    }

    removeLayer(mapInstance, layerRef);
    const group = L.layerGroup();
    group.addTo(mapInstance);
    group.bringToFront?.();
    layerRef.current = group;

    window.clearTimeout(fetchTimerRef.current);
    const delay = lastFetchedKeyRef.current === "" ? 0 : FETCH_DEBOUNCE_MS;

    fetchTimerRef.current = window.setTimeout(() => {
      if (!layerRef.current) return;

      fetchAbortRef.current?.abort();
      const controller = new AbortController();
      fetchAbortRef.current = controller;
      activeFetchKeyRef.current = siteKey;
      lastFetchedKeyRef.current = siteKey;

      (async () => {
        try {
          const {
            displayQuad,
            interpolationMethod,
            idwContributors,
            groundSurveyCount,
          } = await fetchAhdInterpolationContext(sitePoints, lookupState, controller.signal);

          if (controller.signal.aborted || activeFetchKeyRef.current !== siteKey) return;

          removeLayer(mapInstance, layerRef);
          const nextGroup = L.layerGroup();
          renderSiteBoundary(nextGroup, siteGeometry);

          const method = interpolationMethod || "none";
          const usedForInterpolation = method === "bilinear";
          let drawnKeys = new Set();

          if (displayQuad) {
            drawnKeys = renderQuadMonuments(
              nextGroup,
              displayQuad,
              method,
              groundSurveyCount,
              usedForInterpolation
            ) || new Set();
          }

          if (!usedForInterpolation && idwContributors?.length) {
            renderIdwContributors(nextGroup, idwContributors, method, drawnKeys);
          }

          if (!displayQuad && !idwContributors?.length) {
            const sample = sitePoints[0];
            const marker = L.marker([sample.lat, sample.lng], {
              icon: L.divIcon({
                className: "elevation-monument-wrap",
                html: monumentLabelHtml("sw", NaN, "no data", "No Vicmap monuments found"),
                iconSize: [64, 46],
                iconAnchor: [32, 23],
              }),
              interactive: true,
              zIndexOffset: 2900,
            });
            bindMarkerTooltip(marker, "No Vicmap survey monuments found within search radius.");
            nextGroup.addLayer(marker);
          }

          nextGroup.addTo(mapInstance);
          nextGroup.bringToFront?.();
          layerRef.current = nextGroup;
        } catch (err) {
          if (controller.signal.aborted) return;
          if (err?.name === "AbortError") return;
          console.warn("[ElevationInterpolationMonuments] lookup failed:", err);
        }
      })();
    }, delay);

    return () => {
      window.clearTimeout(fetchTimerRef.current);
    };
  }, [siteKey, sitePoints, siteGeometry, enabled, lookupState]);

  return null;
}
