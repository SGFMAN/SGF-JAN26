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
  offsetENFromCenter,
} from "../utils/floorPlanMap";

const LABEL_WIDTH_M = 2;
const FETCH_DEBOUNCE_MS = 300;
const MIN_FONT_PX = 6;
const MIN_LABEL_WIDTH_PX = 24;

function layerPointFor(map, latLng, zoomEvent) {
  if (zoomEvent?.zoom != null && zoomEvent?.center) {
    return map._latLngToNewLayerPoint(latLng, zoomEvent.zoom, zoomEvent.center);
  }
  return map.latLngToLayerPoint(latLng);
}

function metersToLayerPixels(map, lat, lng, meters, zoomEvent) {
  const origin = layerPointFor(map, L.latLng(lat, lng), zoomEvent);
  const east = offsetENFromCenter(lat, lng, meters, 0);
  const edge = layerPointFor(map, L.latLng(east.lat, east.lng), zoomEvent);
  return Math.hypot(edge.x - origin.x, edge.y - origin.y);
}

function estimateTextWidthPx(text, fontSize) {
  return String(text).length * fontSize * 0.58;
}

function labelMetrics(map, lat, lng, hasRelativeLine, zoomEvent) {
  const widthPx = metersToLayerPixels(map, lat, lng, LABEL_WIDTH_M, zoomEvent);
  const fontSize = widthPx * 0.15;
  const relativeFontSize = fontSize * 0.82;
  const paddingX = fontSize * 0.45;
  const paddingY = fontSize * 0.28;
  const border = Math.max(1, fontSize * 0.1);
  const lineHeight = 1.15;
  const gap = hasRelativeLine ? fontSize * 0.12 : 0;
  const heightPx =
    paddingY * 2 +
    border * 2 +
    fontSize * lineHeight +
    (hasRelativeLine ? relativeFontSize * lineHeight + gap : 0);

  return {
    widthPx: Math.round(widthPx),
    heightPx: Math.round(heightPx),
    fontSize,
    relativeFontSize,
    paddingX,
    paddingY,
    border,
  };
}

function labelFits(content, metrics) {
  if (metrics.fontSize < MIN_FONT_PX || metrics.widthPx < MIN_LABEL_WIDTH_PX) {
    return false;
  }
  const innerWidth = metrics.widthPx - 2 * (metrics.paddingX + metrics.border);
  if (innerWidth < 12) return false;
  if (estimateTextWidthPx(content.ahdText, metrics.fontSize) > innerWidth) return false;
  if (
    content.relativeText &&
    estimateTextWidthPx(content.relativeText, metrics.relativeFontSize) > innerWidth
  ) {
    return false;
  }
  return true;
}

function cornerAnchor(cornerId, widthPx, heightPx) {
  switch (cornerId) {
    case "sw":
      return L.point(0, heightPx);
    case "se":
      return L.point(widthPx, heightPx);
    case "ne":
      return L.point(widthPx, 0);
    case "nw":
      return L.point(0, 0);
    default:
      return L.point(widthPx / 2, heightPx / 2);
  }
}

function applyLabelDom(entry, metrics, content) {
  const { wrap, inner } = entry;
  const relativeLine = content.relativeText
    ? `<div style="font: 600 ${metrics.relativeFontSize}px/1.15 system-ui,sans-serif;color:#2563eb;margin-top:${metrics.fontSize * 0.1}px">${content.relativeText}</div>`
    : "";

  wrap.style.width = `${metrics.widthPx}px`;
  wrap.style.height = `${metrics.heightPx}px`;
  wrap.title = content.tooltip || "";

  inner.style.cssText = [
    "box-sizing:border-box",
    "width:100%",
    "height:100%",
    "text-align:center",
    "background:rgba(255,255,255,0.96)",
    `border:${metrics.border}px solid #1d4ed8`,
    `border-radius:${Math.max(2, metrics.fontSize * 0.28)}px`,
    `padding:${metrics.paddingY}px ${metrics.paddingX}px`,
    `font:700 ${metrics.fontSize}px/1.15 system-ui,sans-serif`,
    "color:#1e3a8a",
    "white-space:nowrap",
    `box-shadow:0 ${metrics.border * 2}px ${metrics.border * 6}px rgba(0,0,0,0.22)`,
    "pointer-events:auto",
    "cursor:help",
  ].join(";");
  inner.innerHTML = `<div>${content.ahdText}</div>${relativeLine}`;
}

function updateLabelEntry(map, entry, point, zoomEvent) {
  if (!map || !entry || !point) return;

  const content = entry.labelContent || {
    ahdText: "…",
    relativeText: "",
    tooltip: "",
  };
  const hasRelativeLine = Boolean(content.relativeText);
  const metrics = labelMetrics(map, point.lat, point.lng, hasRelativeLine, zoomEvent);

  if (!labelFits(content, metrics)) {
    entry.wrap.style.display = "none";
    return;
  }

  entry.wrap.style.display = "";
  const anchor = cornerAnchor(point.id, metrics.widthPx, metrics.heightPx);
  const cornerPx = layerPointFor(map, L.latLng(point.lat, point.lng), zoomEvent);
  L.DomUtil.setPosition(entry.wrap, cornerPx.subtract(anchor));

  applyLabelDom(entry, metrics, content);
}

function createLabelEntry(map, point) {
  const wrap = L.DomUtil.create("div", "floor-plan-level-label");
  wrap.style.position = "absolute";
  wrap.style.left = "0";
  wrap.style.top = "0";
  wrap.style.pointerEvents = "auto";
  const inner = L.DomUtil.create("div", "", wrap);
  map.getPane("overlayPane")?.appendChild(wrap);

  return {
    wrap,
    inner,
    point,
    labelContent: {
      ahdText: "…",
      relativeText: "",
      tooltip: "Loading floor plan levels…",
    },
  };
}

function setLabelContent(entry, map, point, ahdText, relativeText = "", tooltip = "", zoomEvent) {
  if (!entry) return;
  entry.labelContent = { ahdText, relativeText, tooltip };
  if (map && point) {
    updateLabelEntry(map, entry, point, zoomEvent);
  }
}

function rescaleAllLabels(map, labels, unitPoints, zoomEvent) {
  for (let index = 0; index < labels.length; index += 1) {
    const point = unitPoints[index];
    if (labels[index] && point) {
      labels[index].point = point;
      updateLabelEntry(map, labels[index], point, zoomEvent);
    }
  }
}

function removeAllLabels(labelsRef) {
  for (const entry of labelsRef.current) {
    L.DomUtil.remove(entry.wrap);
  }
  labelsRef.current = [];
}

function markAllCorners(map, labels, unitPoints, ahdText, relativeText, tooltip, zoomEvent) {
  for (let index = 0; index < labels.length; index += 1) {
    setLabelContent(
      labels[index],
      map,
      unitPoints[index],
      ahdText,
      relativeText,
      tooltip,
      zoomEvent
    );
  }
}

function applyCornerLabels(map, labels, unitPoints, siteCornerLevels, zoomEvent) {
  const elevations = unitPoints.map((point) =>
    interpolateSiteCornerGrid(point.lat, point.lng, siteCornerLevels)
  );
  const highest = elevations.reduce((max, value) => {
    if (!Number.isFinite(value)) return max;
    return max == null || value > max ? value : max;
  }, null);

  for (let index = 0; index < labels.length; index += 1) {
    const entry = labels[index];
    const point = unitPoints[index];
    if (!entry || !point) continue;

    const ahdM = elevations[index];
    if (!Number.isFinite(ahdM) || highest == null) {
      setLabelContent(
        entry,
        map,
        point,
        "—",
        "",
        "Could not interpolate level from site corner heights",
        zoomEvent
      );
      continue;
    }

    const ahdLabel = formatAhdLabel(ahdM);
    const relativeLabel = formatRelativeFallLabel(highest - ahdM);
    setLabelContent(
      entry,
      map,
      point,
      ahdLabel,
      relativeLabel,
      `${ahdLabel} m AHD · ${relativeLabel} m below highest floor plan corner\n` +
        "Interpolated from site boundary corner levels",
      zoomEvent
    );
  }
}

function outOfRangeMessage(unitPoints) {
  const sample = unitPoints[0];
  return `Corner coordinates outside Victoria (${sample.lat.toFixed(5)}, ${sample.lng.toFixed(5)})`;
}

/** AHD + relative fall at floor plan corners — geographic div labels, 2 m wide. */
export default function FloorPlanCornerLevels({
  cornerPoints,
  siteGeometry = null,
  lookupState = "VIC",
  enabled = true,
}) {
  const map = useMap();
  const mapRef = useRef(map);
  mapRef.current = map;

  const labelsRef = useRef([]);
  const unitPointsRef = useRef([]);
  const siteCornerLevelsRef = useRef(null);
  const lastFetchedGeometryKeyRef = useRef("");
  const fetchTimerRef = useRef(null);
  const fetchAbortRef = useRef(null);
  const activeFetchKeyRef = useRef("");

  const geometryKey = useMemo(() => geometryCoordinatesKey(siteGeometry), [siteGeometry]);
  const unitPoints = Array.isArray(cornerPoints) ? cornerPoints : [];
  const cornerKey = useMemo(() => elevationPointsKey(unitPoints), [unitPoints]);

  unitPointsRef.current = unitPoints;

  useEffect(() => {
    return () => {
      window.clearTimeout(fetchTimerRef.current);
      fetchAbortRef.current?.abort();
      removeAllLabels(labelsRef);
    };
  }, []);

  useEffect(() => {
    const mapInstance = mapRef.current;
    if (!enabled || unitPoints.length === 0) {
      return undefined;
    }

    const syncScale = (event) => {
      if (!labelsRef.current.length) return;
      rescaleAllLabels(mapInstance, labelsRef.current, unitPointsRef.current, event);
    };

    mapInstance.on("zoomanim", syncScale);
    mapInstance.on("zoom", syncScale);
    mapInstance.on("viewreset", syncScale);
    mapInstance.on("move", syncScale);

    return () => {
      mapInstance.off("zoomanim", syncScale);
      mapInstance.off("zoom", syncScale);
      mapInstance.off("viewreset", syncScale);
      mapInstance.off("move", syncScale);
    };
  }, [enabled, cornerKey, map]);

  useEffect(() => {
    const mapInstance = mapRef.current;

    if (!enabled || unitPoints.length === 0 || lookupState !== "VIC") {
      window.clearTimeout(fetchTimerRef.current);
      fetchAbortRef.current?.abort();
      removeAllLabels(labelsRef);
      siteCornerLevelsRef.current = null;
      lastFetchedGeometryKeyRef.current = "";
      activeFetchKeyRef.current = "";
      return undefined;
    }

    if (labelsRef.current.length !== unitPoints.length) {
      removeAllLabels(labelsRef);
      labelsRef.current = unitPoints.map((point) => createLabelEntry(mapInstance, point));
    }

    rescaleAllLabels(mapInstance, labelsRef.current, unitPoints);

    if (unitPoints.some((point) => !isVictoriaLatLng(point.lat, point.lng))) {
      markAllCorners(
        mapInstance,
        labelsRef.current,
        unitPoints,
        "—",
        "",
        outOfRangeMessage(unitPoints)
      );
      return undefined;
    }

    const labels = labelsRef.current;
    const hasSiteLevels =
      siteCornerLevelsRef.current &&
      lastFetchedGeometryKeyRef.current === geometryKey &&
      ["nw", "ne", "se", "sw"].every((id) => siteCornerLevelsRef.current?.[id]?.ahdM != null);

    if (hasSiteLevels) {
      applyCornerLabels(mapInstance, labels, unitPoints, siteCornerLevelsRef.current);
      return undefined;
    }

    if (!siteGeometry) {
      markAllCorners(
        mapInstance,
        labels,
        unitPoints,
        "—",
        "",
        "Site boundary required for floor plan levels"
      );
      return undefined;
    }

    window.clearTimeout(fetchTimerRef.current);
    const delay = lastFetchedGeometryKeyRef.current === "" ? 0 : FETCH_DEBOUNCE_MS;

    fetchTimerRef.current = window.setTimeout(() => {
      fetchAbortRef.current?.abort();
      const controller = new AbortController();
      fetchAbortRef.current = controller;
      activeFetchKeyRef.current = geometryKey;

      markAllCorners(
        mapInstance,
        labels,
        unitPoints,
        "…",
        "",
        "Loading site corner levels…"
      );

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
            markAllCorners(mapInstance, labels, unitPoints, "—", "", missing);
            return;
          }

          siteCornerLevelsRef.current = levels;
          lastFetchedGeometryKeyRef.current = geometryKey;
          applyCornerLabels(mapInstance, labels, unitPoints, levels);
        } catch (err) {
          if (controller.signal.aborted) return;
          if (err?.name === "AbortError") {
            if (activeFetchKeyRef.current !== geometryKey) return;
            markAllCorners(
              mapInstance,
              labels,
              unitPoints,
              "—",
              "",
              "Level lookup timed out — try again"
            );
            return;
          }
          console.warn("[FloorPlanCornerLevels] lookup failed:", err);
          if (activeFetchKeyRef.current !== geometryKey) return;
          markAllCorners(
            mapInstance,
            labels,
            unitPoints,
            "—",
            "",
            err.message || "Could not load floor plan levels"
          );
        }
      })();
    }, delay);

    return () => {
      window.clearTimeout(fetchTimerRef.current);
    };
  }, [cornerKey, geometryKey, enabled, lookupState, siteGeometry, unitPoints]);

  return null;
}
