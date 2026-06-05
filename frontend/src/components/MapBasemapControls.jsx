import React from "react";
import { TileLayer } from "react-leaflet";
import {
  getBasemapTileLayerProps,
  listBasemapOptions,
  resolveBasemapId,
} from "../utils/mapBasemaps";

const CONTROL_BG = "rgba(255,255,255,0.94)";
const CONTROL_BORDER = "#d1d1d1";
const CONTROL_TEXT = "#323233";

/**
 * Renders the active imagery TileLayer. Remount via `key` when basemap changes.
 */
export function MapBasemapTileLayer({ basemapId }) {
  const props = getBasemapTileLayerProps(basemapId);
  return (
    <TileLayer
      key={props.key}
      attribution={props.attribution}
      url={props.url}
      maxNativeZoom={props.maxNativeZoom}
      maxZoom={props.maxZoom}
    />
  );
}

/**
 * Basemap dropdown — position:absolute overlay for use inside a `position:relative` map shell.
 */
export function MapBasemapSelector({ basemapId, onBasemapIdChange, basemapConfig, style }) {
  const options = listBasemapOptions(basemapConfig);
  const resolvedId = resolveBasemapId(basemapId, basemapConfig);

  return (
    <div
      style={{
        position: "absolute",
        top: "10px",
        right: "10px",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 10px",
        borderRadius: "10px",
        background: CONTROL_BG,
        border: `1px solid ${CONTROL_BORDER}`,
        boxShadow: "0 2px 10px rgba(0,0,0,0.18)",
        fontSize: "0.85rem",
        color: CONTROL_TEXT,
        ...style,
      }}
    >
      <label htmlFor="sgf-basemap-select" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
        Basemap
      </label>
      <select
        id="sgf-basemap-select"
        value={resolvedId}
        onChange={(e) => onBasemapIdChange(e.target.value)}
        style={{
          padding: "6px 8px",
          borderRadius: "8px",
          border: `1px solid ${CONTROL_BORDER}`,
          background: "#fff",
          color: CONTROL_TEXT,
          fontSize: "0.85rem",
          maxWidth: "min(200px, 42vw)",
        }}
      >
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
