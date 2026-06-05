import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import L from "leaflet";
import { GeoJSON, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import logo from "../images/logo.png";
import { getApiHeaders, isUserAdmin } from "../utils/auth";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const LIGHT_MONUMENT = "#42464d";
const WHITE = "#fff";
const EXPLORER_BG = "#f3f3f3";
const EXPLORER_BORDER = "#d1d1d1";

const DEFAULT_CENTER = [-37.8136, 144.9631];
const DEFAULT_ZOOM = 11;
const SEARCH_ZOOM = 18;

const STATE_PIN_COLOURS = {
  VIC: "#1f6feb",
  QLD: "#d1242f",
};

const PARCEL_STYLE = {
  color: "#FFD700",
  weight: 3,
  fillColor: "#FFD700",
  fillOpacity: 0.08,
};

const ESRI_IMAGERY_TEMPLATE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const NOMINATIM_SEARCH =
  "https://nominatim.openstreetmap.org/search";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
});

const markerIconCache = new Map();
function markerIconForProjectState(stateRaw) {
  const state = String(stateRaw ?? "").trim().toUpperCase();
  const key = state === "QLD" ? "QLD" : "VIC"; // default VIC (blue) unless explicitly QLD
  if (markerIconCache.has(key)) return markerIconCache.get(key);
  const colour = STATE_PIN_COLOURS[key];
  const icon = L.divIcon({
    className: "sgf-state-pin",
    html: `<div style="
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: ${colour};
      border: 2px solid #ffffff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.35);
    "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
  markerIconCache.set(key, icon);
  return icon;
}

function MapFlyTo({ position, zoom, enabled }) {
  const map = useMap();
  useEffect(() => {
    if (!enabled || !position) return;
    map.flyTo(position, zoom, { duration: 1.35, easeLinearity: 0.25 });
  }, [position, zoom, map, enabled]);
  return null;
}

function MapFitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds) return;
    try {
      map.fitBounds(bounds, { padding: [22, 22], animate: true, duration: 1.25 });
    } catch {
      // ignore fit errors
    }
  }, [bounds, map]);
  return null;
}

/** Normalize DB state for filter (matches App usage: VIC / QLD). */
function projectStateUpper(p) {
  return String(p?.state ?? "").trim().toUpperCase();
}

function matchesBulkFilter(selection, p) {
  const s = projectStateUpper(p);
  if (selection === "VIC") return s === "VIC" || s === "VICTORIA";
  if (selection === "QLD") return s === "QLD" || s === "QUEENSLAND";
  return true;
}

function bulkSelectionLabel(selection) {
  if (selection === "VIC") return "VIC";
  if (selection === "QLD") return "QLD";
  return "ALL";
}

function inferStateFromNominatimHit(hit) {
  const addr = hit?.address || {};
  const raw = String(addr.state || addr.region || "").trim().toUpperCase();
  if (raw.includes("QUEENSLAND") || raw === "QLD") return "QLD";
  if (raw.includes("VICTORIA") || raw === "VIC") return "VIC";
  return "VIC";
}

function parcelQueryParamsForPin(lat, lon, searchState, address) {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lon),
    state: searchState,
  });
  if (address) {
    params.set("address", address);
  }
  return params;
}

function boundsFromGeoJsonFeature(feature) {
  if (!feature?.geometry) return null;
  try {
    const layer = L.geoJSON(feature);
    const bounds = layer.getBounds();
    return bounds.isValid() ? bounds : null;
  } catch {
    return null;
  }
}

export default function Maps() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [marker, setMarker] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const [resultLabel, setResultLabel] = useState("");
  const [parcelFeature, setParcelFeature] = useState(null);
  const [parcelBounds, setParcelBounds] = useState(null);
  const [parcelNotice, setParcelNotice] = useState("");
  const [bulkPins, setBulkPins] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, ok: 0, failed: 0 });
  const [bulkBounds, setBulkBounds] = useState(null);
  const [bulkPhase, setBulkPhase] = useState("");
  const [bulkCurrent, setBulkCurrent] = useState("");
  const [bulkSelection, setBulkSelection] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    (async () => setIsAdmin(await isUserAdmin()))();
  }, []);

  const onSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      setError("Enter an address to search.");
      return;
    }
    setLoading(true);
    setError(null);
    setParcelFeature(null);
    setParcelBounds(null);
    setParcelNotice("");
    try {
      const params = new URLSearchParams({
        q,
        format: "json",
        limit: "1",
        addressdetails: "1",
      });
      const url = `${NOMINATIM_SEARCH}?${params.toString()}`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        throw new Error("Geocoding service returned an error. Try again in a moment.");
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        setMarker(null);
        setFlyTarget(null);
        setResultLabel("");
        setError("No results found for that address. Try a different spelling or add suburb / state.");
        return;
      }
      const hit = data[0];
      const lat = parseFloat(hit.lat);
      const lon = parseFloat(hit.lon);
      if (Number.isNaN(lat) || Number.isNaN(lon)) {
        throw new Error("Could not read coordinates for that result.");
      }
      const pos = [lat, lon];
      const label = hit.display_name || q;
      setMarker(pos);
      setResultLabel(label);

      if (!isAdmin) {
        setFlyTarget(pos);
        return;
      }

      const searchState = inferStateFromNominatimHit(hit);
      // Pin: Leaflet [lat, lng]. Parcel API uses the same WGS84 pin (lat=N/S, lng=E/W).
      console.log("[Maps] search pin:", { lat, lng: lon, state: searchState, leaflet: [lat, lon] });

      const parcelParams = parcelQueryParamsForPin(lat, lon, searchState, label);
      const parcelUrl = `/api/property-boundary?${parcelParams.toString()}`;
      console.log("[Maps] property boundary request:", parcelUrl);
      setParcelNotice("Looking up title boundary…");

      try {
        const parcelRes = await fetch(parcelUrl, { headers: getApiHeaders() });
        const parcelData = await parcelRes.json().catch(() => ({}));

        const hasGeometry =
          parcelRes.ok && parcelData.ok && parcelData.geometry;

        if (hasGeometry) {
          const containsPin = parcelData.containsPin === true;
          const approximate = parcelData.approximate === true;
          const matchMethod = parcelData.matchMethod || null;

          console.log("[Maps] property boundary result:", {
            searchedAddress: label,
            markerLat: lat,
            markerLng: lon,
            matchMethod,
            containsPin,
            approximate,
            parcelPfi: parcelData.parcelPfi,
            parcelId: parcelData.parcelId,
            parcelSpi: parcelData.parcelSpi,
            distanceToBoundaryMetres: parcelData.distanceToBoundaryMetres,
            source: parcelData.source,
          });

          if (!containsPin && !approximate) {
            console.warn("[Maps] boundary rejected — does not contain pin and not marked approximate");
            setParcelFeature(null);
            setParcelBounds(null);
            setParcelNotice("Title boundary not available.");
            setFlyTarget(pos);
            return;
          }

          const feature = {
            type: "Feature",
            geometry: parcelData.geometry,
            properties: {
              ...(parcelData.properties || {}),
              parcel_spi: parcelData.parcelSpi || null,
            },
          };
          setParcelFeature(feature);

          if (approximate && parcelData.warning) {
            const dist =
              parcelData.distanceToBoundaryMetres != null
                ? ` (${parcelData.distanceToBoundaryMetres} m from pin)`
                : "";
            setParcelNotice(`${parcelData.warning}${dist}`);
          } else {
            setParcelNotice("");
          }

          const bounds = boundsFromGeoJsonFeature(feature);
          if (bounds && (containsPin || approximate)) {
            setParcelBounds(bounds);
            setFlyTarget(null);
          } else {
            setParcelBounds(null);
            setFlyTarget(pos);
          }
        } else {
          console.log("[Maps] title boundary not available:", {
            searchedAddress: label,
            markerLat: lat,
            markerLng: lon,
            status: parcelRes.status,
            containsPin: parcelData.containsPin,
            matchMethod: parcelData.matchMethod,
            error: parcelData.error,
          });
          setParcelFeature(null);
          setParcelBounds(null);
          setParcelNotice("Title boundary not available.");
          setFlyTarget(pos);
        }
      } catch (parcelErr) {
        console.error("[Maps] property boundary fetch failed:", parcelErr);
        setParcelFeature(null);
        setParcelBounds(null);
        setParcelNotice("Title boundary not available.");
        setFlyTarget(pos);
      }
    } catch (e) {
      setMarker(null);
      setFlyTarget(null);
      setResultLabel("");
      setParcelFeature(null);
      setParcelBounds(null);
      setParcelNotice("");
      setError(e.message || "Search failed.");
    } finally {
      setLoading(false);
    }
  }, [query, isAdmin]);

  const onLoadBulkProjects = useCallback(async (selection) => {
    setBulkLoading(true);
    setBulkSelection(selection);
    setError(null);
    setBulkPins([]);
    setBulkBounds(null);
    setFlyTarget(null);
    setBulkProgress({ done: 0, total: 0, ok: 0, failed: 0 });
    setBulkPhase("Loading projects…");
    setBulkCurrent("");

    const labelSel = bulkSelectionLabel(selection);

    try {
      const res = await fetch("/api/projects");
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error((data && data.error) || "Failed to load projects");
      const list = Array.isArray(data) ? data : [];
      const subset = list.filter((p) => matchesBulkFilter(selection, p));

      const total = subset.length;
      setBulkProgress({ done: 0, total, ok: 0, failed: 0 });

      const pins = [];
      const points = [];

      // 1) Plot any cached coordinates immediately
      setBulkPhase("Rendering cached pins…");
      for (let i = 0; i < subset.length; i++) {
        const p = subset[i];
        const lat = p?.project_lat;
        const lng = p?.project_lng;
        if (lat == null || lng == null) continue;
        const fLat = parseFloat(lat);
        const fLng = parseFloat(lng);
        if (Number.isNaN(fLat) || Number.isNaN(fLng)) continue;

        const street = String(p?.street || "").trim();
        const suburb = String(p?.suburb || "").trim();
        const st = String(p?.state || "").trim();
        const addr = [street, suburb, st].filter(Boolean).join(", ");
        pins.push({
          id: p?.id ?? `${i}`,
          pos: [fLat, fLng],
          label: `${(p?.name || addr || "Project").toString()}`.trim(),
          address: addr,
          status: (p?.status || "").toString(),
          state: projectStateUpper(p),
        });
        points.push(L.latLng(fLat, fLng));
      }
      setBulkPins([...pins]);
      setBulkProgress({ done: 0, total, ok: pins.length, failed: 0 });

      // 2) Geocode missing coords via backend (cached for next time)
      setBulkPhase("Geocoding missing pins (cached for next time)…");
      const missing = subset.filter((p) => p?.project_lat == null || p?.project_lng == null);
      setBulkCurrent("");
      for (let i = 0; i < missing.length; i++) {
        const p = missing[i];
        try {
          const id = p?.id;
          if (!id) throw new Error("Missing project id");
          const street = String(p?.street || "").trim();
          const suburb = String(p?.suburb || "").trim();
          const st = String(p?.state || "").trim();
          const addr = [street, suburb, st].filter(Boolean).join(", ");
          setBulkCurrent(addr || String(p?.name || `Project ${id}`));
          const r2 = await fetch(`/api/projects/${id}/geocode`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ force: false }),
          });
          const d2 = await r2.json().catch(() => ({}));
          if (!r2.ok) throw new Error(d2.error || r2.statusText);

          const fLat = parseFloat(d2.lat);
          const fLng = parseFloat(d2.lng);
          if (Number.isNaN(fLat) || Number.isNaN(fLng)) throw new Error("Invalid geocode response");

          pins.push({
            id: p?.id ?? `${pins.length}`,
            pos: [fLat, fLng],
            label: `${(p?.name || addr || "Project").toString()}`.trim(),
            address: addr,
            status: (p?.status || "").toString(),
            state: projectStateUpper(p),
          });
          points.push(L.latLng(fLat, fLng));
          setBulkProgress((prev) => ({ ...prev, done: prev.done + 1, ok: prev.ok + 1 }));
        } catch {
          setBulkProgress((prev) => ({ ...prev, done: prev.done + 1, failed: prev.failed + 1 }));
        }
        if (i % 3 === 0 || i === missing.length - 1) {
          setBulkPins([...pins]);
        }
      }

      setBulkPins([...pins]);
      setBulkCurrent("");
      setBulkPhase("Done");

      if (points.length >= 2) {
        setBulkBounds(L.latLngBounds(points));
      } else if (points.length === 1) {
        setFlyTarget([points[0].lat, points[0].lng]);
      }
    } catch (e) {
      setError(e.message || `Failed to load ${labelSel} projects`);
    } finally {
      setBulkLoading(false);
    }
  }, []);

  function onKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      onSearch();
    }
  }

  return (
    <div
      className="page-container"
      style={{
        position: "fixed",
        inset: 0,
        background: LIGHT_MONUMENT,
        minHeight: "100vh",
        width: "100vw",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          margin: "32px auto 24px auto",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          padding: "0 32px",
          boxSizing: "border-box",
        }}
      >
        <Link to="/projects" style={{ position: "absolute", left: "40px", cursor: "pointer" }}>
          <img src={logo} alt="SGF Logo" style={{ width: "120px", height: "auto" }} />
        </Link>
        <h1
          style={{
            margin: 0,
            fontSize: "2.4rem",
            fontWeight: 700,
            color: WHITE,
            letterSpacing: "1px",
          }}
        >
          Maps
        </h1>
      </div>

      <div
        className="sections-container"
        style={{
          display: "flex",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          margin: "24px auto 48px auto",
          gap: "32px",
          flexWrap: "wrap",
        }}
      >
        <div
          className="sidebar-menu"
          style={{
            background: SECTION_GREY,
            borderRadius: "16px",
            width: "200px",
            minWidth: "200px",
            minHeight: "520px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
            padding: "32px 12px",
            boxSizing: "border-box",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            gap: "18px",
            color: MONUMENT,
          }}
        >
          <div style={{ flex: 1 }} />
          <Link
            to="/projects"
            style={{
              background: WHITE,
              color: MONUMENT,
              border: "none",
              borderRadius: "10px",
              padding: "13px 8px",
              fontSize: "1.05rem",
              fontWeight: 500,
              textAlign: "center",
              textDecoration: "none",
              letterSpacing: "0.5px",
              display: "block",
            }}
          >
            ← Back to Main
          </Link>
        </div>

        <div
          className="content-section"
          style={{
            background: SECTION_GREY,
            borderRadius: "18px",
            flex: "1 1 320px",
            minWidth: 0,
            minHeight: "520px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
            padding: "16px",
            boxSizing: "border-box",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "stretch",
              gap: "10px",
              background: EXPLORER_BG,
              borderRadius: "12px",
              border: `1px solid ${EXPLORER_BORDER}`,
              padding: "12px 14px",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
            }}
          >
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search address (e.g. 123 Collins St, Melbourne VIC)"
              disabled={loading}
              aria-busy={loading}
              style={{
                flex: "1 1 220px",
                minWidth: 0,
                padding: "12px 14px",
                fontSize: "1rem",
                borderRadius: "10px",
                border: `1px solid ${EXPLORER_BORDER}`,
                background: WHITE,
                color: MONUMENT,
                boxSizing: "border-box",
              }}
            />
            <button
              type="button"
              onClick={onSearch}
              disabled={loading}
              style={{
                padding: "12px 22px",
                fontSize: "1rem",
                fontWeight: 600,
                borderRadius: "10px",
                border: `1px solid ${EXPLORER_BORDER}`,
                background: loading ? "#e0e0e0" : WHITE,
                color: MONUMENT,
                cursor: loading ? "not-allowed" : "pointer",
                letterSpacing: "0.3px",
                whiteSpace: "nowrap",
              }}
            >
              {loading ? "Searching…" : "Search"}
            </button>
            {[
              { key: "VIC", label: "VIC Projects" },
              { key: "QLD", label: "QLD Projects" },
              { key: "ALL", label: "ALL Projects" },
            ].map(({ key: selKey, label }) => {
              const busy = bulkLoading && bulkSelection === selKey;
              return (
                <button
                  key={selKey}
                  type="button"
                  onClick={() => onLoadBulkProjects(selKey)}
                  disabled={bulkLoading}
                  style={{
                    padding: "12px 22px",
                    fontSize: "1rem",
                    fontWeight: 600,
                    borderRadius: "10px",
                    border: `1px solid ${EXPLORER_BORDER}`,
                    background: bulkLoading ? "#e0e0e0" : WHITE,
                    color: MONUMENT,
                    cursor: bulkLoading ? "not-allowed" : "pointer",
                    letterSpacing: "0.3px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {busy ? `Loading ${bulkSelectionLabel(selKey)}…` : label}
                </button>
              );
            })}
          </div>

          {error && (
            <div
              role="alert"
              style={{
                padding: "10px 14px",
                borderRadius: "10px",
                background: "#fdecea",
                border: "1px solid #f5c2c0",
                color: "#842029",
                fontSize: "0.95rem",
              }}
            >
              {error}
            </div>
          )}

          {isAdmin && parcelNotice && !error && (
            <div
              style={{
                padding: "8px 14px",
                borderRadius: "10px",
                background: "#fff8e1",
                border: "1px solid #ffe082",
                color: "#6d5a00",
                fontSize: "0.9rem",
              }}
            >
              {parcelNotice}
            </div>
          )}

          <div
            style={{
              flex: "1 1 auto",
              width: "100%",
              minHeight: "clamp(380px, calc(100vh - 320px), 820px)",
              borderRadius: "14px",
              overflow: "hidden",
              border: `1px solid ${EXPLORER_BORDER}`,
              position: "relative",
              background: "#1a1a1a",
            }}
          >
            <MapContainer
              center={DEFAULT_CENTER}
              zoom={DEFAULT_ZOOM}
              scrollWheelZoom
              style={{ height: "100%", width: "100%", borderRadius: "14px" }}
              zoomControl
            >
              <TileLayer
                attribution='&copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics &amp; contributors | Geocoding &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url={ESRI_IMAGERY_TEMPLATE}
                maxNativeZoom={19}
                maxZoom={20}
              />
              {isAdmin && parcelFeature && (
                <GeoJSON
                  key={JSON.stringify(parcelFeature.geometry?.coordinates)}
                  data={parcelFeature}
                  style={PARCEL_STYLE}
                />
              )}
              {marker && (
                <Marker position={marker}>
                  {resultLabel ? <Popup>{resultLabel}</Popup> : null}
                </Marker>
              )}
              {bulkPins.map((p) => (
                <Marker key={p.id} position={p.pos} icon={markerIconForProjectState(p.state)}>
                  <Popup>
                    <div style={{ fontWeight: 700, marginBottom: "6px" }}>{p.label}</div>
                    {p.address ? <div style={{ fontSize: "0.9rem", marginBottom: "6px" }}>{p.address}</div> : null}
                    {p.status ? <div style={{ fontSize: "0.85rem", color: "#555" }}>Status: {p.status}</div> : null}
                  </Popup>
                </Marker>
              ))}
              <MapFlyTo position={flyTarget} zoom={SEARCH_ZOOM} enabled={!parcelBounds && !bulkBounds} />
              <MapFitBounds bounds={parcelBounds || bulkBounds} />
            </MapContainer>
          </div>

          {bulkProgress.total > 0 && bulkSelection != null && (
            <div style={{ fontSize: "0.85rem", color: "#555" }}>
              <div>
                {bulkSelectionLabel(bulkSelection)} pins loaded: {bulkProgress.ok}/{bulkProgress.total} · geocode
                attempts: {bulkProgress.done} · failures: {bulkProgress.failed}
              </div>
              {bulkPhase ? <div style={{ marginTop: "4px" }}>{bulkPhase}</div> : null}
              {bulkCurrent ? <div style={{ marginTop: "4px" }}>Current: {bulkCurrent}</div> : null}
            </div>
          )}

          <p style={{ margin: 0, fontSize: "0.8rem", color: "#555", lineHeight: 1.45 }}>
            Satellite imagery: Esri World Imagery. Address search: OpenStreetMap Nominatim (please use
            sparingly). VIC title boundaries: Vicmap cadastral parcels matched to the blue search pin
            (contains-point first; nearest-edge fallback marked approximate). Default view: greater Melbourne, Victoria.
          </p>
        </div>
      </div>
    </div>
  );
}
