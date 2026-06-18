import React, { useCallback, useEffect, useRef, useState } from "react";
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
  mergePlanningLayerVisibility,
  overlayLayerKey,
  PLANNING_VISIBILITY_ZONE,
} from "../components/PlanningOverlaysLayer";
import EasementsLayer from "../components/EasementsLayer";
import EditableBuildingsLayer from "../components/EditableBuildingsLayer";
import EditableVerandahsLayer from "../components/EditableVerandahsLayer";
import DraggableFloorPlanOverlay from "../components/DraggableFloorPlanOverlay";
import FloorPlanPickerModal from "../components/FloorPlanPickerModal";
import MapsQuoteModal from "../components/MapsQuoteModal";
import SiteBoundary3DModal from "../components/SiteBoundary3DModal";
import { fetchFloorPlanMeta } from "../utils/floorPlanMap";
import {
  BASEMAP_ESRI_IMAGERY,
  BASEMAP_VICMAP_AERIAL,
  basemapIdForPropertyState,
  DEFAULT_BASEMAP_ID,
  fetchMapBasemapConfig,
  MAP_MAX_ZOOM,
  resolveBasemapId,
} from "../utils/mapBasemaps";
import MapsSidebar, {
  sgfContentPanelStyle,
  sgfPageHeadingStyle,
  sgfSectionsContainerStyle,
} from "../components/MapsSidebar";
import { getApiHeaders, isUserAdmin } from "../utils/auth";
import {
  addRecentMapSearch,
  getSavedBoundaryForRecentQuery,
  saveBoundaryForRecentQuery,
} from "../utils/mapsRecentSearches";

import { UI } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
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

function MapFlyTo({ position, zoom, enabled, flyKey }) {
  const map = useMap();
  const lastFlyRef = useRef(null);
  const posKey = position ? `${position[0]},${position[1]}` : null;

  useEffect(() => {
    if (!enabled || !position || !posKey) return;
    const token = `${flyKey || ""}:${posKey}:${zoom}`;
    if (lastFlyRef.current === token) return;
    lastFlyRef.current = token;
    try {
      const cappedZoom = Math.min(zoom, map.getMaxZoom());
      map.flyTo(position, cappedZoom, { duration: 1.35, easeLinearity: 0.25 });
    } catch {
      // ignore fly errors
    }
  }, [enabled, posKey, zoom, flyKey, map, position]);

  return null;
}

/** Disable map pan while boundary or unit move mode is active. */
function MapPanLock({ locked }) {
  const map = useMap();
  useEffect(() => {
    if (locked) {
      map.dragging.disable();
    } else {
      map.dragging.enable();
    }
  }, [locked, map]);
  return null;
}

function MapFitBounds({ bounds, fitKey }) {
  const map = useMap();
  const lastFitRef = useRef(null);
  const boundsKey =
    bounds?.length === 2 && bounds[0]?.length === 2 && bounds[1]?.length === 2
      ? `${bounds[0][0]},${bounds[0][1]},${bounds[1][0]},${bounds[1][1]}`
      : null;

  useEffect(() => {
    if (!bounds || !boundsKey) {
      if (!boundsKey) lastFitRef.current = null;
      return undefined;
    }
    const token = `${fitKey || ""}:${boundsKey}`;
    if (lastFitRef.current === token) return undefined;
    lastFitRef.current = token;

    let cancelled = false;
    const frameId = requestAnimationFrame(() => {
      if (cancelled) return;
      try {
        map.fitBounds(bounds, {
          padding: [22, 22],
          animate: false,
          maxZoom: MAP_MAX_ZOOM,
        });
      } catch {
        // ignore fit errors
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [boundsKey, fitKey, map, bounds]);

  return null;
}

/** Keep Leaflet tile layout in sync with the fixed map panel size. */
function MapInvalidateSize() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const parent = container.parentElement;
    if (!parent) return undefined;

    const refresh = () => {
      map.invalidateSize();
    };

    refresh();
    const observer = new ResizeObserver(refresh);
    observer.observe(parent);
    window.addEventListener("resize", refresh);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", refresh);
    };
  }, [map]);

  return null;
}

const MAP_RIGHT_PANEL_WIDTH = "360px";

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
    if (!bounds.isValid()) return null;
    return [
      [bounds.getSouth(), bounds.getWest()],
      [bounds.getNorth(), bounds.getEast()],
    ];
  } catch {
    return null;
  }
}

function fitBoundsFromLatLngs(points) {
  if (!points?.length) return null;
  try {
    const bounds = L.latLngBounds(points);
    if (!bounds.isValid()) return null;
    return [
      [bounds.getSouth(), bounds.getWest()],
      [bounds.getNorth(), bounds.getEast()],
    ];
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
  const [buildingsGeoJson, setBuildingsGeoJson] = useState(null);
  const [buildingsLayerVisible, setBuildingsLayerVisible] = useState(true);
  const [addingBuilding, setAddingBuilding] = useState(false);
  const [verandahsGeoJson, setVerandahsGeoJson] = useState(null);
  const [verandahsLayerVisible, setVerandahsLayerVisible] = useState(true);
  const [addingVerandah, setAddingVerandah] = useState(false);
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
  const [showFloorPlanPicker, setShowFloorPlanPicker] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [show3dVisualisationModal, setShow3dVisualisationModal] = useState(false);
  const [placedUnit, setPlacedUnit] = useState(null);
  const [unitPlacementKey, setUnitPlacementKey] = useState(0);
  const [movableTarget, setMovableTarget] = useState(null);
  const hadParcelRef = useRef(false);
  const mapCaptureRef = useRef(null);
  const [propertySearchState, setPropertySearchState] = useState("VIC");
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!show3dVisualisationModal) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [show3dVisualisationModal]);

  useEffect(() => {
    (async () => setIsAdmin(await isUserAdmin()))();
  }, []);

  const onMapView = location.pathname === "/maps" || location.pathname === "/maps/";

  function handleAddUnit() {
    if (!isAdmin) {
      alert("Admin access is required to place floor plans on the map.");
      return;
    }
    setShowFloorPlanPicker(true);
  }

  function handleQuote() {
    setShowQuoteModal(true);
  }

  async function handleOpen3DVisualisation() {
    if (placedUnit?.plan?.id) {
      try {
        const fresh = await fetchFloorPlanMeta(placedUnit.plan.id);
        setPlacedUnit((prev) => (prev?.plan?.id === fresh.id ? { ...prev, plan: fresh } : prev));
      } catch {
        /* use existing plan metadata */
      }
    }
    setShow3dVisualisationModal(true);
  }

  function handleSelectFloorPlan(plan) {
    setShowFloorPlanPicker(false);
    if (!plan?.scale?.metersPerPixel) {
      alert("This floor plan has no scale calibration. Set scale in Maps Settings first.");
      return;
    }
    const initialCenter = marker ? { lat: marker[0], lng: marker[1] } : null;
    setUnitPlacementKey((n) => n + 1);
    setPlacedUnit({ plan, center: initialCenter, bearing: 0 });
    setMovableTarget("unit");
  }

  function handleUnitPlacementChange({ center, bearing }) {
    setPlacedUnit((prev) => (prev ? { ...prev, center, bearing } : null));
  }

  function setMovableTargetExclusive(target) {
    setMovableTarget((prev) => (prev === target ? null : target));
  }

  function toggleBoundaryMovable() {
    setMovableTargetExclusive("boundary");
  }

  function toggleUnitMovable() {
    setMovableTargetExclusive("unit");
  }

  useEffect(() => {
    const hasParcel = Boolean(parcelFeature);
    if (hasParcel && !hadParcelRef.current && !placedUnit) {
      setMovableTarget("boundary");
    }
    if (!hasParcel) {
      hadParcelRef.current = false;
    } else {
      hadParcelRef.current = true;
    }
  }, [parcelFeature, placedUnit]);

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
      const admin = await isUserAdmin();
      if (!admin || searchState !== "VIC") {
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
          setPlanningLayerVisibility((prev) => mergePlanningLayerVisibility(prev, data));
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
    []
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


  const handleAddBuilding = useCallback(() => {
    setAddingVerandah(false);
    setMovableTarget(null);
    setAddingBuilding(true);
  }, []);

  const handleBuildingDrawn = useCallback((geometry) => {
    setBuildingsGeoJson((prev) => {
      const features = prev?.features ? [...prev.features] : [];
      const nextIndex = features.length + 1;
      features.push({
        type: "Feature",
        properties: {
          building_id: `building-${nextIndex}`,
          label: `Building ${nextIndex}`,
        },
        geometry,
      });
      return { type: "FeatureCollection", features };
    });
    setAddingBuilding(false);
  }, []);

  const clearBuildingOutlines = useCallback(() => {
    setBuildingsGeoJson(null);
    setAddingBuilding(false);
  }, []);

  const handleAddVerandah = useCallback(() => {
    setAddingBuilding(false);
    setMovableTarget(null);
    setAddingVerandah(true);
  }, []);

  const handleVerandahDrawn = useCallback((geometry) => {
    setVerandahsGeoJson((prev) => {
      const features = prev?.features ? [...prev.features] : [];
      const nextIndex = features.length + 1;
      features.push({
        type: "Feature",
        properties: {
          verandah_id: `verandah-${nextIndex}`,
          label: `Verandah ${nextIndex}`,
        },
        geometry,
      });
      return { type: "FeatureCollection", features };
    });
    setAddingVerandah(false);
  }, []);

  const clearVerandahOutlines = useCallback(() => {
    setVerandahsGeoJson(null);
    setAddingVerandah(false);
  }, []);

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
    setBuildingsGeoJson(null);
    setBuildingsLayerVisible(true);
    setAddingBuilding(false);
    setVerandahsGeoJson(null);
    setVerandahsLayerVisible(true);
    setAddingVerandah(false);
    setPlacedUnit(null);
    setMovableTarget(null);
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
      setPropertySearchState(searchState);

      const admin = await isUserAdmin();
      setIsAdmin(admin);
      if (!admin) {
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
  }, [query, fetchPlanningForSite, fetchEasementsForSite]);

  const onSearch = useCallback(() => {
    void runSearch();
  }, [runSearch]);

  useEffect(() => {
    const searchQuery = location.state?.searchQuery;
    if (!searchQuery) return undefined;
    const q = String(searchQuery);
    setQuery(q);
    navigate("/maps", { replace: true, state: {} });
    const id = window.setTimeout(() => {
      void runSearch(q);
    }, 0);
    return () => window.clearTimeout(id);
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
        setBulkBounds(fitBoundsFromLatLngs(points));
      } else if (points.length === 1) {
        setFlyTarget([points[0].lat, points[0].lng]);
      }
    } catch (e) {
      setError(e.message || `Failed to load ${labelSel} projects`);
    } finally {
      setBulkLoading(false);
    }
  }, []);

  const resolvedBasemapId = resolveBasemapId(basemapId, basemapConfig);

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
      <div style={sgfPageHeadingStyle}>
        <Link to="/projects" style={{ position: "absolute", left: "40px", cursor: "pointer" }}>
          <img
            src={logo}
            alt="SGF Logo"
            style={{
              width: "120px",
              height: "auto",
            }}
          />
        </Link>
        <div style={{ display: "flex", alignItems: "center" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "2.4rem",
              fontWeight: 700,
              color: PAGE_TEXT,
              letterSpacing: "1px",
            }}
          >
            Maps
          </h1>
        </div>
      </div>

      <div className="sections-container" style={sgfSectionsContainerStyle}>
        <MapsSidebar
          activeView={location.pathname === "/maps/sold-projects" ? "sold" : "map"}
          onLoadBulkProjects={onLoadBulkProjects}
          bulkLoading={bulkLoading}
          bulkSelection={bulkSelection}
          showAddUnit={isAdmin && onMapView}
          onAddUnit={handleAddUnit}
          showAddBuilding={isAdmin && onMapView && Boolean(parcelFeature)}
          onAddBuilding={handleAddBuilding}
          addBuildingDisabled={addingVerandah}
          addBuildingActive={addingBuilding}
          showAddVerandah={isAdmin && onMapView && Boolean(parcelFeature)}
          onAddVerandah={handleAddVerandah}
          addVerandahDisabled={addingBuilding}
          addVerandahActive={addingVerandah}
          showQuote={isAdmin && onMapView}
          onQuote={handleQuote}
        />

        <div
          className="content-section"
          style={{
            ...sgfContentPanelStyle,
            minWidth: 0,
            padding: "14px",
            display: "flex",
            flexDirection: "row",
            gap: "14px",
          }}
        >
          <div
            ref={mapCaptureRef}
            style={{
              flex: "1 1 auto",
              minWidth: 0,
              height: "100%",
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
              style={{ height: "100%", width: "100%" }}
              zoomControl
            >
              <MapBasemapTileLayer basemapId={resolvedBasemapId} />
              <MapInvalidateSize />
              <MapPanLock locked={movableTarget != null || addingBuilding || addingVerandah} />
              {parcelFeature && (
                <DraggableParcelBoundary
                  key={activeSearchQuery || "boundary"}
                  feature={parcelFeature}
                  onFeatureChange={onParcelFeatureChange}
                  movable={movableTarget === "boundary"}
                  onToggleMovable={toggleBoundaryMovable}
                />
              )}
              {isAdmin && (
                <PlanningOverlaysLayer
                  zoneGeoJson={planningZoneGeoJson}
                  overlayGeoJson={planningOverlayGeoJson}
                  layerVisibility={planningLayerVisibility}
                  blockPointerEvents={movableTarget != null || addingBuilding || addingVerandah}
                />
              )}
              {easementsGeoJson && (
                <EasementsLayer
                  key={activeSearchQuery || "easements"}
                  easementsGeoJson={easementsGeoJson}
                  blockPointerEvents={movableTarget != null || addingBuilding || addingVerandah}
                />
              )}
              {isAdmin && parcelFeature && (
                <EditableBuildingsLayer
                  buildingsGeoJson={buildingsGeoJson}
                  visible={buildingsLayerVisible}
                  drawingActive={addingBuilding}
                  onDrawingComplete={handleBuildingDrawn}
                  onDrawingCancel={() => setAddingBuilding(false)}
                />
              )}
              {isAdmin && parcelFeature && (
                <EditableVerandahsLayer
                  verandahsGeoJson={verandahsGeoJson}
                  visible={verandahsLayerVisible}
                  drawingActive={addingVerandah}
                  onDrawingComplete={handleVerandahDrawn}
                  onDrawingCancel={() => setAddingVerandah(false)}
                />
              )}
              {isAdmin && placedUnit && onMapView && !show3dVisualisationModal && (
                <DraggableFloorPlanOverlay
                  key={`${placedUnit.plan.id}-${unitPlacementKey}`}
                  plan={placedUnit.plan}
                  initialCenter={placedUnit.center}
                  initialBearing={placedUnit.bearing ?? 0}
                  onPlacementChange={handleUnitPlacementChange}
                  movable={movableTarget === "unit"}
                  onToggleMovable={toggleUnitMovable}
                  siteGeometry={parcelFeature?.geometry ?? null}
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
              <MapFlyTo
                position={flyTarget}
                zoom={SEARCH_ZOOM}
                enabled={!parcelBounds && !bulkBounds}
                flyKey={activeSearchQuery}
              />
              <MapFitBounds
                bounds={parcelBounds || bulkBounds}
                fitKey={activeSearchQuery || (bulkBounds ? "bulk" : "")}
              />
            </MapContainer>
          </div>

          <aside
            style={{
              flex: `0 0 ${MAP_RIGHT_PANEL_WIDTH}`,
              width: MAP_RIGHT_PANEL_WIDTH,
              height: "100%",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              overflowY: "auto",
              overflowX: "hidden",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                background: EXPLORER_BG,
                borderRadius: "12px",
                border: `1px solid ${EXPLORER_BORDER}`,
                padding: "12px 14px",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
              }}
            >
              <div
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "#666",
                  marginBottom: "6px",
                }}
              >
                Address
              </div>
              <div
                style={{
                  fontSize: "0.92rem",
                  lineHeight: 1.45,
                  color: MONUMENT,
                  wordBreak: "break-word",
                }}
              >
                {resultLabel || activeSearchQuery || "Search for an address to begin"}
              </div>
            </div>

            <div
              style={{
                background: EXPLORER_BG,
                borderRadius: "12px",
                border: `1px solid ${EXPLORER_BORDER}`,
                padding: "12px 14px",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "#666",
                }}
              >
                Search
              </div>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="123 Collins St, Melbourne VIC"
                disabled={loading || parcelLoading}
                aria-busy={loading}
                style={{
                  width: "100%",
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
                  width: "100%",
                  padding: "10px 14px",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  borderRadius: "10px",
                  border: `1px solid ${EXPLORER_BORDER}`,
                  background: loading ? UI.border : WHITE,
                  color: MONUMENT,
                  cursor: loading ? "not-allowed" : "pointer",
                  letterSpacing: "0.3px",
                }}
              >
                {loading ? "Searching…" : parcelLoading ? "Loading…" : "Search"}
              </button>
            </div>

            <div
              style={{
                background: EXPLORER_BG,
                borderRadius: "12px",
                border: `1px solid ${EXPLORER_BORDER}`,
                padding: "12px 14px",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
              }}
            >
              <MapBasemapSelector
                basemapId={basemapId}
                onBasemapIdChange={setBasemapId}
                basemapConfig={basemapConfig}
                placement="inline"
                style={{ width: "100%" }}
              />
            </div>

            {isAdmin && (planningLoading || planningInfo) && !error && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  padding: "10px 12px",
                  borderRadius: "12px",
                  background: "#f3e8ff",
                  border: "1px solid #d8b4fe",
                  fontSize: "0.8rem",
                  color: MONUMENT,
                  maxHeight: "220px",
                  overflowY: "auto",
                }}
              >
                {planningLoading ? (
                  <span>Loading planning…</span>
                ) : (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", lineHeight: 1.4 }}>
                      <strong style={{ fontSize: "0.82rem" }}>Planning</strong>
                      <span style={{ color: "#555" }}>Council: {planningInfo.council || "—"}</span>
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

            {isAdmin && parcelFeature && (
              <div
                style={{
                  background: EXPLORER_BG,
                  borderRadius: "12px",
                  border: `1px solid ${EXPLORER_BORDER}`,
                  padding: "10px 12px",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  fontSize: "0.82rem",
                  color: MONUMENT,
                }}
              >
                <div style={{ fontWeight: 700 }}>Buildings</div>
                {buildingsGeoJson?.features?.length > 0 && (
                  <span style={{ color: "#555", lineHeight: 1.4 }}>
                    {buildingsGeoJson.features.length}{" "}
                    {buildingsGeoJson.features.length === 1 ? "building" : "buildings"} drawn — shown
                    on the map and in 3D.
                  </span>
                )}
                {addingBuilding && (
                  <>
                    <span style={{ color: "#555", lineHeight: 1.4 }}>
                      Click each corner on the map. Click the first point again to finish.
                    </span>
                    <button
                      type="button"
                      onClick={() => setAddingBuilding(false)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        borderRadius: "10px",
                        border: `1px solid ${EXPLORER_BORDER}`,
                        background: WHITE,
                        color: MONUMENT,
                        cursor: "pointer",
                      }}
                    >
                      Done
                    </button>
                  </>
                )}
                {buildingsGeoJson?.features?.length > 0 && (
                  <>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={buildingsLayerVisible}
                        onChange={() => setBuildingsLayerVisible((visible) => !visible)}
                        style={{ marginTop: "1px", flexShrink: 0 }}
                      />
                      <span>Show building outlines</span>
                    </label>
                    <button
                      type="button"
                      onClick={clearBuildingOutlines}
                      disabled={addingBuilding}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        borderRadius: "10px",
                        border: `1px solid ${EXPLORER_BORDER}`,
                        background: WHITE,
                        color: MONUMENT,
                        cursor: addingBuilding ? "not-allowed" : "pointer",
                      }}
                    >
                      Clear all buildings
                    </button>
                  </>
                )}

                <div style={{ height: "1px", background: EXPLORER_BORDER, margin: "2px 0" }} />

                <div style={{ fontWeight: 700 }}>Verandahs</div>
                {verandahsGeoJson?.features?.length > 0 && (
                  <span style={{ color: "#555", lineHeight: 1.4 }}>
                    {verandahsGeoJson.features.length}{" "}
                    {verandahsGeoJson.features.length === 1 ? "verandah" : "verandahs"} drawn —
                    shown on the map, quote, and 3D.
                  </span>
                )}
                {addingVerandah && (
                  <>
                    <span style={{ color: "#555", lineHeight: 1.4 }}>
                      Click each corner on the map. Click the first point again to finish.
                    </span>
                    <button
                      type="button"
                      onClick={() => setAddingVerandah(false)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        borderRadius: "10px",
                        border: `1px solid ${EXPLORER_BORDER}`,
                        background: WHITE,
                        color: MONUMENT,
                        cursor: "pointer",
                      }}
                    >
                      Done
                    </button>
                  </>
                )}
                {verandahsGeoJson?.features?.length > 0 && (
                  <>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={verandahsLayerVisible}
                        onChange={() => setVerandahsLayerVisible((visible) => !visible)}
                        style={{ marginTop: "1px", flexShrink: 0 }}
                      />
                      <span>Show verandahs</span>
                    </label>
                    <button
                      type="button"
                      onClick={clearVerandahOutlines}
                      disabled={addingVerandah}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        borderRadius: "10px",
                        border: `1px solid ${EXPLORER_BORDER}`,
                        background: WHITE,
                        color: MONUMENT,
                        cursor: addingVerandah ? "not-allowed" : "pointer",
                      }}
                    >
                      Clear all verandahs
                    </button>
                  </>
                )}
              </div>
            )}

            {parcelFeature && (
              <button
                type="button"
                onClick={() => void handleOpen3DVisualisation()}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  borderRadius: "10px",
                  border: "1px solid #d8b4fe",
                  background: WHITE,
                  color: MONUMENT,
                  cursor: "pointer",
                  letterSpacing: "0.2px",
                }}
              >
                3d Visualisation
              </button>
            )}

            {error && (
              <div
                role="alert"
                style={{
                  padding: "10px 14px",
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

            {isAdmin && (parcelNotice || parcelLoading) && !error && (
              <div
                style={{
                  padding: "8px 14px",
                  borderRadius: "10px",
                  background: "#fff8e1",
                  border: "1px solid #ffe082",
                  color: "#6d5a00",
                  fontSize: "0.88rem",
                }}
              >
                {parcelLoading && !parcelNotice ? "Looking up title boundary…" : parcelNotice}
              </div>
            )}

            {bulkProgress.total > 0 && bulkSelection != null && (
              <div
                style={{
                  fontSize: "0.82rem",
                  color: "#555",
                  padding: "8px 10px",
                  borderRadius: "10px",
                  background: EXPLORER_BG,
                  border: `1px solid ${EXPLORER_BORDER}`,
                }}
              >
                <div>
                  {bulkSelectionLabel(bulkSelection)} pins loaded: {bulkProgress.ok}/{bulkProgress.total} · geocode
                  attempts: {bulkProgress.done} · failures: {bulkProgress.failed}
                </div>
                {bulkPhase ? <div style={{ marginTop: "4px" }}>{bulkPhase}</div> : null}
                {bulkCurrent ? <div style={{ marginTop: "4px" }}>Current: {bulkCurrent}</div> : null}
              </div>
            )}
          </aside>
        </div>
      </div>

      {showFloorPlanPicker && (
        <FloorPlanPickerModal
          onSelect={handleSelectFloorPlan}
          onClose={() => setShowFloorPlanPicker(false)}
        />
      )}

      {showQuoteModal && (
        <MapsQuoteModal
          onClose={() => setShowQuoteModal(false)}
          unitPlan={placedUnit?.plan ?? null}
          verandahsGeoJson={verandahsGeoJson}
          proposalContext={{
            mapElement: mapCaptureRef.current,
            siteGeometry: parcelFeature?.geometry ?? null,
            lookupState: propertySearchState,
            placedUnit,
            buildingsGeoJson,
            verandahsGeoJson,
            addressLabel: resultLabel || activeSearchQuery || "",
          }}
        />
      )}

      {show3dVisualisationModal && parcelFeature?.geometry && (
        <SiteBoundary3DModal
          siteGeometry={parcelFeature.geometry}
          lookupState={propertySearchState}
          placedUnit={placedUnit}
          buildingsGeoJson={buildingsGeoJson}
          verandahsGeoJson={verandahsGeoJson}
          onBack={() => setShow3dVisualisationModal(false)}
        />
      )}
    </div>
  );
}
