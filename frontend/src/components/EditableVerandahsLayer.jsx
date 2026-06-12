import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

export const VERANDAHS_PANE = "sgfVerandahsPane";

const VERANDAH_OUTLINE_COLOR = "#6b4423";
const TIMBER_DECK_PATTERN_ID = "sgf-timber-deck-pattern";

const VERANDAH_OUTLINE_STYLE = {
  color: VERANDAH_OUTLINE_COLOR,
  weight: 2,
  opacity: 1,
  fill: true,
  fillOpacity: 1,
  fillColor: "#b8956a",
};

const DRAFT_LINE_STYLE = {
  color: VERANDAH_OUTLINE_COLOR,
  weight: 2,
  opacity: 0.9,
  dashArray: "6 4",
};

const CLOSE_HIT_PX = 12;

function ensureVerandahsPane(map) {
  if (!map.getPane(VERANDAHS_PANE)) {
    map.createPane(VERANDAHS_PANE);
    map.getPane(VERANDAHS_PANE).style.zIndex = "945";
  }
}

function ensureTimberDeckPattern(map) {
  const host = map.getContainer();
  if (host.querySelector(`#${TIMBER_DECK_PATTERN_ID}`)) return;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "sgf-pattern-defs");
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
  svg.innerHTML = `<defs>
    <pattern id="${TIMBER_DECK_PATTERN_ID}" patternUnits="userSpaceOnUse" width="28" height="28">
      <rect width="28" height="28" fill="#b8956a"/>
      <rect y="0" width="28" height="4" fill="#9a7340"/>
      <rect y="13" width="28" height="2" fill="#8b6914" opacity="0.45"/>
      <rect y="24" width="28" height="4" fill="#6b4423"/>
    </pattern>
  </defs>`;
  host.appendChild(svg);
}

function applyTimberDeckFill(layer) {
  const el = layer.getElement?.();
  if (!el) return;
  el.setAttribute("fill", `url(#${TIMBER_DECK_PATTERN_ID})`);
  el.setAttribute("fill-opacity", "1");
}

function ringLatLngs(geometry) {
  if (geometry?.type !== "Polygon") return [];
  const ring = geometry.coordinates?.[0];
  if (!ring?.length) return [];
  const points = ring.slice();
  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
      points.pop();
    }
  }
  return points.map(([lng, lat]) => L.latLng(lat, lng));
}

function latLngsToPolygonGeometry(latlngs) {
  if (latlngs.length < 3) return null;
  const coords = latlngs.map(({ lat, lng }) => [lng, lat]);
  const first = coords[0];
  coords.push([first[0], first[1]]);
  return { type: "Polygon", coordinates: [coords] };
}

function isNearLatLng(map, a, b, thresholdPx = CLOSE_HIT_PX) {
  const p1 = map.latLngToContainerPoint(a);
  const p2 = map.latLngToContainerPoint(b);
  return p1.distanceTo(p2) <= thresholdPx;
}

function vertexIcon(isFirst) {
  return L.divIcon({
    className: "sgf-verandah-draw-vertex",
    iconSize: [10, 10],
    iconAnchor: [5, 5],
    html: `<div style="width:10px;height:10px;border-radius:50%;background:${isFirst ? "#22c55e" : "#d4a574"};border:2px solid #6b4423;box-sizing:border-box;"></div>`,
  });
}

export default function EditableVerandahsLayer({
  verandahsGeoJson,
  visible = true,
  drawingActive = false,
  onDrawingComplete,
  onDrawingCancel,
}) {
  const map = useMap();
  const onCompleteRef = useRef(onDrawingComplete);
  const onCancelRef = useRef(onDrawingCancel);
  onCompleteRef.current = onDrawingComplete;
  onCancelRef.current = onDrawingCancel;

  const draftPointsRef = useRef([]);
  const draftLayerRef = useRef(null);

  useEffect(() => {
    if (!visible) return undefined;

    let cancelled = false;
    let layerGroup = null;

    const frameId = requestAnimationFrame(() => {
      if (cancelled) return;
      try {
        ensureVerandahsPane(map);
        ensureTimberDeckPattern(map);
        layerGroup = L.layerGroup([], { pane: VERANDAHS_PANE });

        for (const feature of verandahsGeoJson?.features || []) {
          const latlngs = ringLatLngs(feature.geometry);
          if (latlngs.length < 3) continue;
          const polygon = L.polygon(latlngs, {
            ...VERANDAH_OUTLINE_STYLE,
            pane: VERANDAHS_PANE,
            interactive: false,
          });
          polygon.on("add", () => applyTimberDeckFill(polygon));
          layerGroup.addLayer(polygon);
        }

        layerGroup.addTo(map);
      } catch (err) {
        console.error("[EditableVerandahsLayer] render failed:", err);
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      if (layerGroup) map.removeLayer(layerGroup);
    };
  }, [verandahsGeoJson, visible, map]);

  useEffect(() => {
    if (!drawingActive) {
      draftPointsRef.current = [];
      if (draftLayerRef.current) {
        map.removeLayer(draftLayerRef.current);
        draftLayerRef.current = null;
      }
      return undefined;
    }

    ensureVerandahsPane(map);
    ensureTimberDeckPattern(map);
    const container = map.getContainer();
    const prevCursor = container.style.cursor;
    container.style.cursor = "crosshair";

    draftPointsRef.current = [];
    draftLayerRef.current = L.layerGroup([], { pane: VERANDAHS_PANE }).addTo(map);

    function redrawDraft() {
      const group = draftLayerRef.current;
      if (!group) return;
      group.clearLayers();
      const points = draftPointsRef.current;
      if (!points.length) return;

      points.forEach((latlng, index) => {
        group.addLayer(
          L.marker(latlng, {
            pane: VERANDAHS_PANE,
            interactive: false,
            icon: vertexIcon(index === 0),
            zIndexOffset: 1000,
          })
        );
      });

      if (points.length >= 2) {
        group.addLayer(
          L.polyline(points, {
            ...DRAFT_LINE_STYLE,
            pane: VERANDAHS_PANE,
            interactive: false,
          })
        );
      }
    }

    function onMapClick(event) {
      if (event.target?.closest?.(".leaflet-control")) return;
      const clicked = map.mouseEventToLatLng(event);
      const points = draftPointsRef.current;

      if (points.length >= 3 && isNearLatLng(map, points[0], clicked)) {
        const geometry = latLngsToPolygonGeometry(points);
        if (geometry) {
          onCompleteRef.current?.(geometry);
        }
        draftPointsRef.current = [];
        redrawDraft();
        return;
      }

      draftPointsRef.current = [...points, clicked];
      redrawDraft();
    }

    function onKeyDown(event) {
      if (event.key === "Escape") {
        draftPointsRef.current = [];
        redrawDraft();
        onCancelRef.current?.();
      } else if (event.key === "Backspace" || event.key === "Delete") {
        draftPointsRef.current = draftPointsRef.current.slice(0, -1);
        redrawDraft();
      }
    }

    map.doubleClickZoom.disable();
    container.addEventListener("click", onMapClick, true);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      container.removeEventListener("click", onMapClick, true);
      window.removeEventListener("keydown", onKeyDown);
      map.doubleClickZoom.enable();
      container.style.cursor = prevCursor;
      if (draftLayerRef.current) {
        map.removeLayer(draftLayerRef.current);
        draftLayerRef.current = null;
      }
      draftPointsRef.current = [];
    };
  }, [drawingActive, map]);

  return null;
}
