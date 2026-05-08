import React, { useCallback, useEffect, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

const DEFAULT_CENTER = [-37.8136, 144.9631];
const DEFAULT_ZOOM = 11;
const RESULT_ZOOM = 18;

const ESRI_IMAGERY_TEMPLATE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";

const siteMarkerIcon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function MapFlyTo({ position, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (!position) return;
    map.flyTo(position, zoom, { duration: 1.35, easeLinearity: 0.25 });
  }, [position, zoom, map]);
  return null;
}

function MapResizeOnOpen({ isActive }) {
  const map = useMap();
  useEffect(() => {
    if (!isActive) return;
    const run = () => map.invalidateSize({ animate: false });
    run();
    const id = requestAnimationFrame(run);
    const t1 = window.setTimeout(run, 100);
    const t2 = window.setTimeout(run, 350);
    return () => {
      cancelAnimationFrame(id);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [isActive, map]);
  return null;
}

export default function SiteSatelliteMapModal({ open, onClose, addressQuery }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [markerPos, setMarkerPos] = useState(null);
  const [popupLabel, setPopupLabel] = useState("");
  const [flyTarget, setFlyTarget] = useState(null);

  const fetchGeocode = useCallback(async (q) => {
    const query = q.trim();
    if (!query) {
      setError("No address to search.");
      setMarkerPos(null);
      setFlyTarget(null);
      setPopupLabel("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setMarkerPos(null);
    setFlyTarget(null);
    setPopupLabel("");
    try {
      const params = new URLSearchParams({
        q: query,
        format: "json",
        limit: "1",
        addressdetails: "1",
      });
      const res = await fetch(`${NOMINATIM_SEARCH}?${params.toString()}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error("Could not reach the geocoding service.");
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        setError(`No location found for: ${query}`);
        return;
      }
      const hit = data[0];
      const lat = parseFloat(hit.lat);
      const lon = parseFloat(hit.lon);
      if (Number.isNaN(lat) || Number.isNaN(lon)) {
        throw new Error("Invalid coordinates in search result.");
      }
      const pos = [lat, lon];
      setMarkerPos(pos);
      setFlyTarget(pos);
      setPopupLabel(hit.display_name || query);
    } catch (e) {
      setError(e.message || "Lookup failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setError(null);
      setMarkerPos(null);
      setFlyTarget(null);
      setPopupLabel("");
      setLoading(false);
      return;
    }
    void fetchGeocode(addressQuery || "");
  }, [open, addressQuery, fetchGeocode]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="site-map-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10040,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        boxSizing: "border-box",
        background: "rgba(0,0,0,0.45)",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(920px, 100%)",
          maxHeight: "min(720px, calc(100vh - 32px))",
          background: "#a1a1a3",
          borderRadius: "18px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid #d1d1d1",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            padding: "14px 16px",
            borderBottom: "1px solid #d1d1d1",
            background: "#f3f3f3",
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2
              id="site-map-modal-title"
              style={{
                margin: 0,
                fontSize: "1.15rem",
                fontWeight: 700,
                color: "#323233",
              }}
            >
              Site map
            </h2>
            {addressQuery ? (
              <div
                style={{
                  marginTop: "4px",
                  fontSize: "0.8rem",
                  color: "#555",
                  lineHeight: 1.35,
                  wordBreak: "break-word",
                }}
              >
                {addressQuery}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              flexShrink: 0,
              padding: "8px 14px",
              borderRadius: "10px",
              border: "1px solid #d1d1d1",
              background: "#fff",
              color: "#323233",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: "0.95rem",
            }}
          >
            Close
          </button>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              margin: "12px 16px 0 16px",
              padding: "10px 12px",
              borderRadius: "10px",
              background: "#fdecea",
              border: "1px solid #f5c2c0",
              color: "#842029",
              fontSize: "0.9rem",
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            position: "relative",
            flex: "1 1 auto",
            minHeight: "min(480px, 55vh)",
            margin: "12px 16px 16px 16px",
            borderRadius: "14px",
            overflow: "hidden",
            border: "1px solid #d1d1d1",
            background: "#1a1a1a",
          }}
        >
          <MapContainer
            center={DEFAULT_CENTER}
            zoom={DEFAULT_ZOOM}
            scrollWheelZoom
            style={{ height: "100%", width: "100%", minHeight: "min(480px, 55vh)" }}
            zoomControl
          >
            <TileLayer
              attribution='&copy; <a href="https://www.esri.com/">Esri</a>, Maxar | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url={ESRI_IMAGERY_TEMPLATE}
              maxNativeZoom={19}
              maxZoom={20}
            />
            <MapResizeOnOpen isActive={open} />
            {markerPos && (
              <Marker position={markerPos} icon={siteMarkerIcon}>
                {popupLabel ? <Popup>{popupLabel}</Popup> : null}
              </Marker>
            )}
            <MapFlyTo position={flyTarget} zoom={RESULT_ZOOM} />
          </MapContainer>
          {loading && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255,255,255,0.55)",
                fontSize: "1rem",
                fontWeight: 600,
                color: "#323233",
                pointerEvents: "none",
              }}
            >
              Finding address…
            </div>
          )}
        </div>

        <p style={{ margin: "0 16px 14px 16px", fontSize: "0.75rem", color: "#555", lineHeight: 1.4 }}>
          Esri World Imagery · OpenStreetMap Nominatim
        </p>
      </div>
    </div>
  );
}
