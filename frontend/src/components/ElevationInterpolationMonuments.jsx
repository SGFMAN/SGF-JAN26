import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import {
  fetchMonumentBox,
  formatAhdLabel,
  isVictoriaLatLng,
  siteBoundaryRingLatLng,
} from "../utils/floorPlanMap";

const FETCH_DEBOUNCE_MS = 300;
const QUAD_ORDER = ["nw", "ne", "se", "sw"];

const MONUMENT_STYLES = {
  nw: { label: "NW", color: "#d97706", fill: "#fdba74" },
  ne: { label: "NE", color: "#059669", fill: "#6ee7b7" },
  se: { label: "SE", color: "#2563eb", fill: "#93c5fd" },
  sw: { label: "SW", color: "#7c3aed", fill: "#c4b5fd" },
};

function escapeAttr(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function monumentLabelHtml(cornerId, ahdM, tooltip = "") {
  const style = MONUMENT_STYLES[cornerId] || { label: cornerId.toUpperCase(), color: "#9333ea", fill: "#e9d5ff" };
  const titleAttr = tooltip ? ` title="${escapeAttr(tooltip)}"` : "";
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
    <div style="font-size:10px; letter-spacing:0.04em;">MON ${style.label}</div>
    <div style="font-size:13px; margin-top:1px;">${formatAhdLabel(ahdM)}</div>
  </div>`;
}

function siteCornerLabelHtml(cornerId) {
  const style = MONUMENT_STYLES[cornerId] || { label: cornerId.toUpperCase(), color: "#15803d" };
  return `<div style="
    font: 700 9px/1 system-ui, sans-serif;
    color: ${style.color};
    background: rgba(255,255,255,0.95);
    border: 1px solid ${style.color};
    border-radius: 3px;
    padding: 2px 4px;
    white-space: nowrap;
  ">SITE ${style.label}</div>`;
}

function bindMarkerTooltip(marker, tooltip) {
  if (!marker || !tooltip) return;
  marker.unbindTooltip?.();
  marker.bindTooltip(tooltip, {
    permanent: false,
    direction: "top",
    offset: [0, -8],
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

function geometryKey(geometry) {
  if (!geometry) return "";
  try {
    return JSON.stringify(geometry.coordinates);
  } catch {
    return "";
  }
}

function renderSiteBoundary(group, siteGeometry) {
  const ring = siteBoundaryRingLatLng(siteGeometry);
  if (ring.length < 3) return ring;

  group.addLayer(
    L.polygon(ring, {
      color: "#15803d",
      weight: 2,
      opacity: 0.9,
      dashArray: "6 4",
      fillColor: "#86efac",
      fillOpacity: 0.1,
      interactive: false,
    })
  );
  return ring;
}

function renderSiteExtremeCorners(group, siteCorners) {
  if (!siteCorners) return;

  for (const cornerId of QUAD_ORDER) {
    const corner = siteCorners[cornerId];
    if (!corner || !Number.isFinite(corner.lat)) continue;

    group.addLayer(
      L.circleMarker([corner.lat, corner.lng], {
        radius: 5,
        color: MONUMENT_STYLES[cornerId]?.color || "#15803d",
        weight: 2,
        fillColor: "#fff",
        fillOpacity: 1,
        interactive: false,
        zIndexOffset: 2750,
      })
    );

    const marker = L.marker([corner.lat, corner.lng], {
      icon: L.divIcon({
        className: "site-corner-wrap",
        html: siteCornerLabelHtml(cornerId),
        iconSize: [48, 14],
        iconAnchor: [24, -4],
      }),
      interactive: false,
      zIndexOffset: 2760,
    });
    group.addLayer(marker);
  }
}

function renderMonumentBox(group, monuments, encapsulatesSite, missing) {
  const positions = [];
  const boxColor = encapsulatesSite ? "#9333ea" : "#dc2626";

  for (const cornerId of QUAD_ORDER) {
    const monument = monuments?.[cornerId];
    if (!monument || !Number.isFinite(monument.lat)) continue;

    positions.push([monument.lat, monument.lng]);
    const style = MONUMENT_STYLES[cornerId];
    const tooltip =
      `Monument ${style.label}\n` +
      `${monument.lat.toFixed(6)}, ${monument.lng.toFixed(6)}\n` +
      `${formatAhdLabel(monument.ahdM)} m AHD\n` +
      `${monument.distM ?? "?"} m from site ${style.label} corner` +
      (monument.searchRadiusM ? `\nFound within ${monument.searchRadiusM} m search` : "");

    group.addLayer(
      L.circleMarker([monument.lat, monument.lng], {
        radius: 8,
        color: style.color,
        weight: 3,
        fillColor: style.fill,
        fillOpacity: 0.95,
        interactive: false,
        zIndexOffset: 2850,
      })
    );

    const marker = L.marker([monument.lat, monument.lng], {
      icon: L.divIcon({
        className: "elevation-monument-wrap",
        html: monumentLabelHtml(cornerId, monument.ahdM, tooltip),
        iconSize: [64, 40],
        iconAnchor: [32, 46],
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
    group.addLayer(
      L.polyline(ring, {
        color: boxColor,
        weight: 3,
        opacity: 0.9,
        interactive: false,
      })
    );
    group.addLayer(
      L.polygon(positions, {
        color: boxColor,
        weight: 1,
        opacity: 0.6,
        fillColor: encapsulatesSite ? "#c084fc" : "#fca5a5",
        fillOpacity: 0.1,
        interactive: false,
      })
    );
  } else if (missing?.length) {
    const sample = positions[0];
    if (sample) {
      const marker = L.marker(sample, {
        icon: L.divIcon({
          className: "elevation-monument-wrap",
          html: `<div style="padding:6px 10px;background:#fff;border:2px solid #dc2626;border-radius:6px;font:700 11px system-ui;color:#dc2626;">Missing: ${missing.join(", ").toUpperCase()}</div>`,
          iconSize: [120, 30],
          iconAnchor: [60, 15],
        }),
        interactive: true,
        zIndexOffset: 2900,
      });
      bindMarkerTooltip(marker, `No monument found outside site ${missing.join(", ")} corner(s)`);
      group.addLayer(marker);
    }
  }
}

/** Four monuments outside site NW/NE/SE/SW extremes, with surrounding box. */
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

  const siteKey = useMemo(() => geometryKey(siteGeometry), [siteGeometry]);
  const siteRing = useMemo(() => siteBoundaryRingLatLng(siteGeometry), [siteGeometry]);

  useEffect(() => {
    return () => {
      window.clearTimeout(fetchTimerRef.current);
      fetchAbortRef.current?.abort();
      removeLayer(mapRef.current, layerRef);
    };
  }, []);

  useEffect(() => {
    const mapInstance = mapRef.current;

    if (!enabled || !siteGeometry || siteRing.length < 3 || lookupState !== "VIC") {
      window.clearTimeout(fetchTimerRef.current);
      fetchAbortRef.current?.abort();
      removeLayer(mapInstance, layerRef);
      lastFetchedKeyRef.current = "";
      activeFetchKeyRef.current = "";
      return undefined;
    }

    if (siteRing.some(([lat, lng]) => !isVictoriaLatLng(lat, lng))) {
      removeLayer(mapInstance, layerRef);
      return undefined;
    }

    removeLayer(mapInstance, layerRef);
    const group = L.layerGroup();
    renderSiteBoundary(group, siteGeometry);
    group.addTo(mapInstance);
    group.bringToFront?.();
    layerRef.current = group;

    window.clearTimeout(fetchTimerRef.current);
    const delay = lastFetchedKeyRef.current === "" ? 0 : FETCH_DEBOUNCE_MS;

    fetchTimerRef.current = window.setTimeout(() => {
      fetchAbortRef.current?.abort();
      const controller = new AbortController();
      fetchAbortRef.current = controller;
      activeFetchKeyRef.current = siteKey;
      lastFetchedKeyRef.current = siteKey;

      (async () => {
        try {
          const data = await fetchMonumentBox(siteGeometry, lookupState, controller.signal);
          if (controller.signal.aborted || activeFetchKeyRef.current !== siteKey) return;

          removeLayer(mapInstance, layerRef);
          const nextGroup = L.layerGroup();
          renderSiteBoundary(nextGroup, siteGeometry);
          renderSiteExtremeCorners(nextGroup, data.siteCorners);
          renderMonumentBox(
            nextGroup,
            data.monuments,
            data.encapsulatesSite,
            data.missing
          );

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
  }, [siteKey, siteGeometry, siteRing, enabled, lookupState]);

  return null;
}
