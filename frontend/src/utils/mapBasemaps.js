/** Shared basemap definitions for Leaflet maps (Maps page, site satellite modal). */

export const BASEMAP_VICMAP_AERIAL = "vicmap-aerial";
export const BASEMAP_ESRI_IMAGERY = "esri-imagery";
export const BASEMAP_NEARMAP = "nearmap";

export const DEFAULT_BASEMAP_ID = BASEMAP_VICMAP_AERIAL;

/** Leaflet map max zoom (wheel zoom). Tiles upscale beyond each layer's maxNativeZoom. */
export const MAP_MAX_ZOOM = 23;

const ESRI_IMAGERY_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

/** Vicmap Basemaps WMTS — AERIAL_WM_256 @ EPSG:3857:256 (higher detail than legacy Esri global mosaic). */
const VICMAP_AERIAL_WMTS_URL =
  "https://base.maps.vic.gov.au/service?service=wmts&request=GetTile&version=1.0.0&layer=AERIAL_WM_256&style=default&format=image%2Fpng&tilematrixset=EPSG%3A3857%3A256&tilematrix={z}&tilerow={y}&tilecol={x}";

export const NEARMAP_TILE_PROXY_PATH = "/api/maps/nearmap-tiles/{z}/{x}/{y}.jpg";

const BASEMAP_DEFS = {
  [BASEMAP_VICMAP_AERIAL]: {
    id: BASEMAP_VICMAP_AERIAL,
    label: "Vicmap Aerial",
    attribution:
      '&copy; <a href="https://www.land.vic.gov.au/maps-and-spatial/data-services/vicmap-basemaps">State of Victoria</a> (Vicmap Basemaps)',
    url: VICMAP_AERIAL_WMTS_URL,
    maxNativeZoom: 20,
    maxZoom: MAP_MAX_ZOOM,
  },
  [BASEMAP_ESRI_IMAGERY]: {
    id: BASEMAP_ESRI_IMAGERY,
    label: "Esri World Imagery",
    attribution:
      '&copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics &amp; contributors',
    url: ESRI_IMAGERY_URL,
    maxNativeZoom: 22,
    maxZoom: MAP_MAX_ZOOM,
  },
  [BASEMAP_NEARMAP]: {
    id: BASEMAP_NEARMAP,
    label: "Nearmap",
    attribution: '&copy; <a href="https://www.nearmap.com/">Nearmap</a>',
    url: NEARMAP_TILE_PROXY_PATH,
    maxNativeZoom: 21,
    maxZoom: MAP_MAX_ZOOM,
    requiresNearmapKey: true,
  },
};

/** @returns {Promise<{ nearmapEnabled: boolean, defaultBasemapId?: string }>} */
export async function fetchMapBasemapConfig() {
  try {
    const res = await fetch("/api/maps/basemap-config");
    if (!res.ok) throw new Error("config unavailable");
    const data = await res.json();
    return {
      nearmapEnabled: data.nearmapEnabled === true,
      defaultBasemapId: data.defaultBasemapId || DEFAULT_BASEMAP_ID,
    };
  } catch {
    return { nearmapEnabled: false, defaultBasemapId: DEFAULT_BASEMAP_ID };
  }
}

/** @param {{ nearmapEnabled?: boolean }} config */
export function listBasemapOptions(config = {}) {
  const nearmapEnabled = config.nearmapEnabled === true;
  return Object.values(BASEMAP_DEFS)
    .filter((def) => !def.requiresNearmapKey || nearmapEnabled)
    .map(({ id, label, requiresNearmapKey }) => ({
      id,
      label,
      disabled: false,
      hidden: false,
      requiresNearmapKey: !!requiresNearmapKey,
    }));
}

/** @param {string} basemapId @param {{ nearmapEnabled?: boolean }} config */
export function resolveBasemapId(basemapId, config = {}) {
  const options = listBasemapOptions(config);
  const allowed = new Set(options.map((o) => o.id));
  if (basemapId && allowed.has(basemapId)) return basemapId;
  return config.defaultBasemapId || DEFAULT_BASEMAP_ID;
}

/** @param {string} basemapId */
export function getBasemapTileLayerProps(basemapId) {
  const def = BASEMAP_DEFS[basemapId] || BASEMAP_DEFS[DEFAULT_BASEMAP_ID];
  return {
    key: def.id,
    url: def.url,
    attribution: def.attribution,
    maxNativeZoom: def.maxNativeZoom,
    maxZoom: def.maxZoom,
  };
}

/** Prefer Vicmap for VIC searches; Esri elsewhere when auto-selecting. */
export function basemapIdForPropertyState(stateRaw) {
  const s = String(stateRaw ?? "").trim().toUpperCase();
  if (s === "VIC" || s === "VICTORIA") return BASEMAP_VICMAP_AERIAL;
  if (s === "QLD" || s === "QUEENSLAND") return BASEMAP_ESRI_IMAGERY;
  return DEFAULT_BASEMAP_ID;
}
