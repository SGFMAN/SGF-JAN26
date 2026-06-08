import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import L from "leaflet";
import { MapContainer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import logo from "../images/logo.png";
import { MapBasemapSelector, MapBasemapTileLayer } from "../components/MapBasemapControls";
import DraggableParcelBoundary from "../components/DraggableParcelBoundary";
import PlanningOverlaysLayer, {
  buildInitialPlanningLayerVisibility,
  overlayLayerKey,
  PLANNING_VISIBILITY_ZONE,
} from "../components/PlanningOverlaysLayer";
import EasementsLayer from "../components/EasementsLayer";
import {
  BASEMAP_ESRI_IMAGERY,
  BASEMAP_VICMAP_AERIAL,
  basemapIdForPropertyState,
  DEFAULT_BASEMAP_ID,
  fetchMapBasemapConfig,
  MAP_MAX_ZOOM,
  resolveBasemapId,
} from "../utils/mapBasemaps";
import MapsSidebar from "../components/MapsSidebar";
import { getApiHeaders, isUserAdmin } from "../utils/auth";
import {
  addRecentMapSearch,
  getSavedBoundaryForRecentQuery,
  saveBoundaryForRecentQuery,
} from "../utils/mapsRecentSearches";

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

/** WGS84 envelope west,south,east,north for planning overlay queries. */
function envelopeParamFromGeometry(geometry) {
  if (!geometry) return null;
  try {
    const layer = L.geoJSON({ type: "Feature", geometry });
    const bounds = layer.getBounds();
    if (!bounds?.isValid()) return null;
    return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(",");
  } catch {
    return null;
  }
}

export default function Maps() {
  const [query, setQuery] = useState("");
  const [parcelLoading, setParcelLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [marker, setMarker] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const [resultLabel, setResultLabel] = useState("");
  const [parcelFeature, setParcelFeature] = useState(null);
  const [parcelBounds, setParcelBounds] = useState(null);
  const [parcelNotice, setParcelNotice] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState("");
  const [planningInfo, setPlanningInfo] = useState(null);
  const [planningZoneGeoJson, setPlanningZoneGeoJson] = useState(null);
  const [planningOverlayGeoJson, setPlanningOverlayGeoJson] = useState(null);
  const [planningLayerVisibility, setPlanningLayerVisibility] = useState({});
  const [planningLoading, setPlanningLoading] = useState(false);
  const [easementsGeoJson, setEasementsGeoJson] = useState(null);
  const [bulkPins, setBulkPins] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, ok: 0, failed: 0 });
  const [bulkBounds, setBulkBounds] = useState(null);
  const [bulkPhase, setBulkPhase] = useState("");
  const [bulkCurrent, setBulkCurrent] = useState("");
  const [bulkSelection, setBulkSelection] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [basemapConfig, setBasemapConfig] = useState({
    nearmapEnabled: false,
    defaultBasemapId: DEFAULT_BASEMAP_ID,
  });
  const [basemapId, setBasemapId] = useState(DEFAULT_BASEMAP_ID);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    (async () => setIsAdmin(await isUserAdmin()))();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const config = await fetchMapBasemapConfig();
      if (cancelled) return;
      setBasemapConfig(config);
      setBasemapId((prev) => resolveBasemapId(prev, config));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchPlanningForSite = useCallback(
    async (lat, lng, searchState, boundaryGeometry) => {
      if (!isAdmin || searchState !== "VIC") {
        setPlanningInfo(null);
        setPlanningZoneGeoJson(null);
        setPlanningOverlayGeoJson(null);
        setPlanningLayerVisibility({});
        return;
      }

      setPlanningLoading(true);
      try {
        const params = new URLSearchParams({
          lat: String(lat),
          lng: String(lng),
          state: "VIC",
        });
        const envelope = envelopeParamFromGeometry(boundaryGeometry);
        if (envelope) params.set("envelope", envelope);

        const res = await fetch(`/api/planning-info?${params.toString()}`, {
          headers: getApiHeaders(),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          setPlanningInfo(data);
          setPlanningZoneGeoJson(data.zoneGeoJson || null);
          setPlanningOverlayGeoJson(data.overlayGeoJson || null);
          setPlanningLayerVisibility(buildInitialPlanningLayerVisibility(data));
        } else {
          setPlanningInfo(null);
          setPlanningZoneGeoJson(null);
          setPlanningOverlayGeoJson(null);
          setPlanningLayerVisibility({});
        }
      } catch (err) {
        console.error("[Maps] planning-info fetch failed:", err);
        setPlanningInfo(null);
        setPlanningZoneGeoJson(null);
        setPlanningOverlayGeoJson(null);
        setPlanningLayerVisibility({});
      } finally {
        setPlanningLoading(false);
      }
    },
    [isAdmin]
  );

  const fetchEasementsForSite = useCallback(
    async (lat, lng, searchState, boundaryGeometry, parcelId) => {
      if (searchState !== "VIC") {
        setEasementsGeoJson(null);
        return;
      }

      const admin = await isUserAdmin();
      if (!admin) {
        setEasementsGeoJson(null);
        return;
      }

      try {
        const envelope = envelopeParamFromGeometry(boundaryGeometry);
        const res = await fetch("/api/property-easements", {
          method: "POST",
          headers: getApiHeaders(),
          body: JSON.stringify({
            lat,
            lng,
            state: "VIC",
            parcelId: parcelId || null,
            envelope: envelope || null,
            boundary: boundaryGeometry || null,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          setEasementsGeoJson(data.easementsGeoJson || null);
        } else {
          setEasementsGeoJson(null);
        }
      } catch (err) {
        console.error("[Maps] property-easements fetch failed:", err);
        setEasementsGeoJson(null);
      }
    },
    []
  );

  const runSearch = useCallback(async (searchQueryOverride) => {
    const q = (searchQueryOverride != null ? String(searchQueryOverride) : query).trim();
    if (!q) {
      setError("Enter an address to search.");
      return;
    }
    if (searchQueryOverride != null) {
      setQuery(q);
    }
    setLoading(true);
    setError(null);
    setParcelFeature(null);
    setParcelBounds(null);
    setParcelNotice("");
    setPlanningInfo(null);
    setPlanningZoneGeoJson(null);
    setPlanningOverlayGeoJson(null);
    setPlanningLayerVisibility({});
    setEasementsGeoJson(null);
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
        setActiveSearchQuery("");
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
      setFlyTarget(pos);
      setLoading(false);
      setBasemapId(basemapIdForPropertyState(inferStateFromNominatimHit(hit)));
      addRecentMapSearch({ query: q, label });
      setActiveSearchQuery(q);

      const searchState = inferStateFromNominatimHit(hit);

      if (!isAdmin) {
        return;
      }

      const savedFeature = getSavedBoundaryForRecentQuery(q);
      if (savedFeature) {
        setParcelFeature(savedFeature);
        setParcelNotice("");
        const bounds = boundsFromGeoJsonFeature(savedFeature);
        if (bounds) {
          setParcelBounds(bounds);
          setFlyTarget(null);
        } else {
          setParcelBounds(null);
          setFlyTarget(pos);
        }
        void fetchPlanningForSite(lat, lon, searchState, savedFeature.geometry);
        void fetchEasementsForSite(
          lat,
          lon,
          searchState,
          savedFeature.geometry,
          savedFeature.properties?.parcel_pfi || savedFeature.properties?.parcelId || null
        );
        return;
      }

      console.log("[Maps] search pin:", { lat, lng: lon, state: searchState, leaflet: [lat, lon] });

      const parcelParams = parcelQueryParamsForPin(lat, lon, searchState, label);
      const parcelUrl = `/api/property-boundary?${parcelParams.toString()}`;
      console.log("[Maps] property boundary request:", parcelUrl);
      setParcelLoading(true);
      setParcelNotice("Looking up title boundary…");

      const boundaryController = new AbortController();
      const boundaryTimeout = setTimeout(() => boundaryController.abort(), 25000);
      let planningBoundaryGeometry = null;
      let parcelIdForEasements = null;

      try {
        const parcelRes = await fetch(parcelUrl, {
          headers: getApiHeaders(),
          signal: boundaryController.signal,
        });
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
            void fetchPlanningForSite(lat, lon, searchState, null);
            window.setTimeout(() => {
              void fetchEasementsForSite(lat, lon, searchState, null, null);
            }, 300);
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
          planningBoundaryGeometry = feature.geometry;
          parcelIdForEasements = parcelData.parcelId || parcelData.parcelPfi || null;

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
            timedOut: parcelData.timedOut,
            error: parcelData.error,
          });
          setParcelFeature(null);
          setParcelBounds(null);
          setParcelNotice(
            parcelData.timedOut || parcelRes.status === 504
              ? "Title boundary lookup timed out — try again. The pin is still shown."
              : parcelData.error || "Title boundary not available."
          );
        }
      } catch (parcelErr) {
        const aborted = parcelErr?.name === "AbortError";
        console.error("[Maps] property boundary fetch failed:", parcelErr);
        setParcelFeature(null);
        setParcelBounds(null);
        setParcelNotice(
          aborted
            ? "Title boundary lookup timed out — try again. The pin is still shown."
            : "Title boundary not available."
        );
      } finally {
        clearTimeout(boundaryTimeout);
        setParcelLoading(false);
        void fetchPlanningForSite(lat, lon, searchState, planningBoundaryGeometry);
        window.setTimeout(() => {
          void fetchEasementsForSite(
            lat,
            lon,
            searchState,
            planningBoundaryGeometry,
            parcelIdForEasements
          );
        }, planningBoundaryGeometry ? 900 : 300);
      }
    } catch (e) {
      setMarker(null);
      setFlyTarget(null);
      setResultLabel("");
      setParcelFeature(null);
      setParcelBounds(null);
      setParcelNotice("");
      setActiveSearchQuery("");
      setError(e.message || "Search failed.");
    } finally {
      setLoading(false);
    }
  }, [query, isAdmin, fetchPlanningForSite, fetchEasementsForSite]);

  const onSearch = useCallback(() => {
    void runSearch();
  }, [runSearch]);

  useEffect(() => {
    const searchQuery = location.state?.searchQuery;
    if (!searchQuery) return;
    navigate("/maps", { replace: true, state: {} });
    void runSearch(String(searchQuery));
  }, [location.state?.searchQuery, navigate, runSearch]);

  const onParcelFeatureChange = useCallback(
    (feature) => {
      setParcelFeature(feature);
      if (activeSearchQuery) {
        saveBoundaryForRecentQuery(activeSearchQuery, feature);
      }
      if (marker?.length === 2) {
        void fetchPlanningForSite(marker[0], marker[1], "VIC", feature.geometry);
        void fetchEasementsForSite(
          marker[0],
          marker[1],
          "VIC",
          feature.geometry,
          feature.properties?.parcel_pfi || feature.properties?.parcelId || null
        );
      }
    },
    [activeSearchQuery, marker, fetchPlanningForSite, fetchEasementsForSite]
  );

  const togglePlanningLayer = useCallback((layerKey) => {
    setPlanningLayerVisibility((prev) => ({
      ...prev,
      [layerKey]: !prev[layerKey],
    }));
  }, []);

  const onLoadBulkProjects = useCallback(async (selection) => {
    setBulkLoading(true);
    setBulkSelection(selection);
    if (selection === "VIC") {
      setBasemapId(BASEMAP_VICMAP_AERIAL);
    } else if (selection === "QLD") {
      setBasemapId(BASEMAP_ESRI_IMAGERY);
    }
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
        <MapsSidebar
          activeView={location.pathname === "/maps/sold-projects" ? "sold" : "map"}
          onLoadBulkProjects={onLoadBulkProjects}
          bulkLoading={bulkLoading}
          bulkSelection={bulkSelection}
        />

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
              flexDirection: "column",
              gap: "10px",
              background: EXPLORER_BG,
              borderRadius: "12px",
              border: `1px solid ${EXPLORER_BORDER}`,
              padding: "12px 14px",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "nowrap",
                alignItems: "stretch",
                gap: "10px",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  flex: "0 1 380px",
                  maxWidth: "420px",
                  minWidth: "280px",
                  display: "flex",
                  gap: "8px",
                }}
              >
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Search address (e.g. 123 Collins St, Melbourne VIC)"
                  disabled={loading || parcelLoading}
                  aria-busy={loading}
                  style={{
                    flex: "1 1 0",
                    minWidth: 0,
                    padding: "10px 12px",
                    fontSize: "0.9rem",
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
                  disabled={loading || parcelLoading}
                  style={{
                    flexShrink: 0,
                    padding: "10px 14px",
                    fontSize: "0.9rem",
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
                  {loading ? "Searching…" : parcelLoading ? "Loading…" : "Search"}
                </button>
              </div>

              {isAdmin && (planningLoading || planningInfo) && !error && (
                <div
                  style={{
                    flex: "1 1 0",
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    padding: "8px 12px",
                    borderRadius: "10px",
                    background: "#f3e8ff",
                    border: "1px solid #d8b4fe",
                    fontSize: "0.8rem",
                    color: MONUMENT,
                    maxHeight: "140px",
                    overflowY: "auto",
                  }}
                >
                  {planningLoading ? (
                    <span>Loading planning…</span>
                  ) : (
                    <>
                      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", lineHeight: 1.4 }}>
                        <strong style={{ fontSize: "0.82rem" }}>Planning</strong>
                        <span style={{ color: "#555" }}>
                          Council: {planningInfo.council || "—"}
                        </span>
                      </div>
                      <ul
                        style={{
                          margin: 0,
                          padding: 0,
                          listStyle: "none",
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                        }}
                      >
                        {planningInfo.planningZone && (
                          <li>
                            <label
                              style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: "8px",
                                cursor: "pointer",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={planningLayerVisibility[PLANNING_VISIBILITY_ZONE] === true}
                                onChange={() => togglePlanningLayer(PLANNING_VISIBILITY_ZONE)}
                                style={{ marginTop: "2px", flexShrink: 0 }}
                              />
                              <span>
                                <span style={{ color: "#166534", fontWeight: 600 }}>Zone: </span>
                                {planningInfo.planningZone.code}
                                {planningInfo.planningZone.description
                                  ? ` — ${planningInfo.planningZone.description}`
                                  : ""}
                              </span>
                            </label>
                          </li>
                        )}
                        {(planningInfo.overlays || []).map((overlay) => {
                          const key = overlayLayerKey(overlay);
                          if (!key) return null;
                          const label =
                            overlay.code && overlay.description
                              ? `${overlay.code} — ${overlay.description}`
                              : overlay.code || overlay.description;
                          return (
                            <li key={key}>
                              <label
                                style={{
                                  display: "flex",
                                  alignItems: "flex-start",
                                  gap: "8px",
                                  cursor: "pointer",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={planningLayerVisibility[key] === true}
                                  onChange={() => togglePlanningLayer(key)}
                                  style={{ marginTop: "2px", flexShrink: 0 }}
                                />
                                <span>{label}</span>
                              </label>
                            </li>
                          );
                        })}
                        {!planningInfo.planningZone && !(planningInfo.overlays || []).length && (
                          <li style={{ color: "#666" }}>No zone or overlays</li>
                        )}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>

            <MapBasemapSelector
              basemapId={basemapId}
              onBasemapIdChange={setBasemapId}
              basemapConfig={basemapConfig}
              placement="inline"
            />
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

          {isAdmin && (parcelNotice || parcelLoading) && !error && (
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
              {parcelLoading && !parcelNotice
                ? "Looking up title boundary…"
                : parcelNotice}
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
              maxZoom={MAP_MAX_ZOOM}
              scrollWheelZoom
              style={{ height: "100%", width: "100%", borderRadius: "14px" }}
              zoomControl
            >
              <MapBasemapTileLayer basemapId={basemapId} />
              {isAdmin && parcelFeature && (
                <DraggableParcelBoundary
                  feature={parcelFeature}
                  onFeatureChange={onParcelFeatureChange}
                />
              )}
              {isAdmin && (
                <PlanningOverlaysLayer
                  zoneGeoJson={planningZoneGeoJson}
                  overlayGeoJson={planningOverlayGeoJson}
                  layerVisibility={planningLayerVisibility}
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
              {isAdmin && (
                <EasementsLayer easementsGeoJson={easementsGeoJson} />
              )}
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
            Imagery: Vicmap Aerial (default for VIC), Esri World Imagery, or Nearmap when configured.
            Address search: OpenStreetMap Nominatim (please use sparingly). VIC title boundaries: Vicmap
            cadastral parcels matched to the blue search pin (contains-point first; nearest-edge fallback
            marked approximate). Planning: Vicmap zone (green) and overlays (purple / light blue) — toggle each layer in the planning panel.
            Easements: Vicmap Property (red lines) shown automatically on the map. Default view: greater Melbourne, Victoria.
          </p>
        </div>
      </div>
    </div>
  );
}
