import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

const PARCEL_YELLOW = "#FFD700";

const YELLOW_STYLE = {
  color: PARCEL_YELLOW,
  weight: 1,
  fillColor: PARCEL_YELLOW,
  fillOpacity: 0.07,
};

function isLatLng(value) {
  return value instanceof L.LatLng;
}

function isLatLngRing(value) {
  return Array.isArray(value) && value.length > 0 && isLatLng(value[0]);
}

function translateLatLngs(latlngs, dLat, dLng) {
  if (isLatLngRing(latlngs)) {
    return latlngs.map((ll) => L.latLng(ll.lat + dLat, ll.lng + dLng));
  }
  if (Array.isArray(latlngs)) {
    return latlngs.map((ring) => translateLatLngs(ring, dLat, dLng));
  }
  return latlngs;
}

function forEachPathLayer(group, fn) {
  group.eachLayer((layer) => {
    if (layer instanceof L.Polygon || layer instanceof L.Polyline) {
      fn(layer);
    } else if (layer.eachLayer) {
      forEachPathLayer(layer, fn);
    }
  });
}

function translateLayerGroup(group, dLat, dLng) {
  forEachPathLayer(group, (layer) => {
    layer.setLatLngs(translateLatLngs(layer.getLatLngs(), dLat, dLng));
  });
}

function ringToCoordinates(ring) {
  const coords = ring.map((ll) => [ll.lng, ll.lat]);
  if (coords.length > 0) {
    const [firstLng, firstLat] = coords[0];
    const [lastLng, lastLat] = coords[coords.length - 1];
    if (firstLng !== lastLng || firstLat !== lastLat) {
      coords.push([firstLng, firstLat]);
    }
  }
  return coords;
}

function polygonLayerToGeometry(layer) {
  const latlngs = layer.getLatLngs();
  if (isLatLngRing(latlngs)) {
    return { type: "Polygon", coordinates: [ringToCoordinates(latlngs)] };
  }
  if (Array.isArray(latlngs) && isLatLngRing(latlngs[0])) {
    return { type: "Polygon", coordinates: latlngs.map(ringToCoordinates) };
  }
  return null;
}

function geometryFromLayerGroup(group) {
  const polygons = [];
  forEachPathLayer(group, (layer) => {
    const geom = polygonLayerToGeometry(layer);
    if (geom) polygons.push(geom);
  });
  if (polygons.length === 0) return null;
  if (polygons.length === 1) return polygons[0];
  return {
    type: "MultiPolygon",
    coordinates: polygons.map((g) => g.coordinates),
  };
}

function applyGrabCursor(group) {
  forEachPathLayer(group, (layer) => {
    const el = layer.getElement?.();
    if (el) el.style.cursor = "grab";
  });
}

/** Title boundary — hover shows grab hand; drag to reposition. */
export default function DraggableParcelBoundary({ feature, onFeatureChange }) {
  const map = useMap();
  const boundaryRef = useRef(null);
  const featureRef = useRef(feature);
  featureRef.current = feature;

  useEffect(() => {
    if (!feature?.geometry) return undefined;

    const boundaryGroup = L.layerGroup();

    const beginDrag = (startEvent) => {
      L.DomEvent.stopPropagation(startEvent);
      L.DomEvent.preventDefault(startEvent);
      map.dragging.disable();
      map.getContainer().style.cursor = "grabbing";
      forEachPathLayer(boundaryGroup, (layer) => {
        const el = layer.getElement?.();
        if (el) el.style.cursor = "grabbing";
      });

      let last = startEvent.latlng;

      const onMove = (ev) => {
        const dLat = ev.latlng.lat - last.lat;
        const dLng = ev.latlng.lng - last.lng;
        last = ev.latlng;
        translateLayerGroup(boundaryGroup, dLat, dLng);
      };

      const onUp = () => {
        map.off("mousemove", onMove);
        map.off("mouseup", onUp);
        map.dragging.enable();
        map.getContainer().style.cursor = "";
        applyGrabCursor(boundaryGroup);

        const geometry = geometryFromLayerGroup(boundaryGroup);
        if (!geometry) return;
        onFeatureChange({
          ...featureRef.current,
          geometry,
        });
      };

      map.on("mousemove", onMove);
      map.on("mouseup", onUp);
    };

    L.geoJSON(feature, {
      style: YELLOW_STYLE,
      interactive: true,
      onEachFeature: (_feat, layer) => {
        layer.on("mousedown", beginDrag);
      },
    }).eachLayer((layer) => boundaryGroup.addLayer(layer));

    boundaryRef.current = boundaryGroup;
    boundaryGroup.addTo(map);
    applyGrabCursor(boundaryGroup);

    return () => {
      map.removeLayer(boundaryGroup);
      boundaryRef.current = null;
    };
  }, [feature?.geometry, map, onFeatureChange]);

  return null;
}

export { YELLOW_STYLE as PARCEL_BOUNDARY_STYLE };
