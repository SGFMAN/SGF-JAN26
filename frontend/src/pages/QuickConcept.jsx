import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import L from "leaflet";
import { MapContainer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import ToolsSidebarMenu from "../components/ToolsSidebarMenu";
import { MapBasemapTileLayer } from "../components/MapBasemapControls";
import EasementsLayer from "../components/EasementsLayer";
import useAppLogo from "../hooks/useAppLogo.js";
import { getApiHeaders, isUserAdmin } from "../utils/auth";
import {
  addRecentMapSearch,
  getSavedBoundaryForRecentQuery,
} from "../utils/mapsRecentSearches";
import {
  basemapIdForPropertyState,
  DEFAULT_BASEMAP_ID,
  fetchMapBasemapConfig,
  MAP_MAX_ZOOM,
  resolveBasemapId,
} from "../utils/mapBasemaps";
import { PARCEL_BOUNDARY_STYLE } from "../utils/parcelBoundaryStyle";
import { UI } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const EXPLORER_BORDER = "#d1d1d1";

/** Fallback canvas scale before a site is loaded: 1 metre = this many CSS pixels. */
const DEFAULT_PPM = 40;
const MIN_SIZE_PX = 4;
/** Movement while the button is down that counts as click-and-hold drag. */
const HOLD_DRAG_PX = 8;
const CLOSE_PX = 14;
const EDGE_HIT_PX = 10;
const MAX_AREA_M2 = 60;

const DEFAULT_CENTER = [-37.8136, 144.9631];
const SEARCH_ZOOM = 18;
const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";

function toolbarButtonStyle(enabled = true) {
  return {
    background: WHITE,
    color: MONUMENT,
    border: `1px solid ${UI.outline}`,
    borderRadius: "8px",
    padding: "8px 16px",
    fontSize: "0.95rem",
    fontWeight: 600,
    cursor: enabled ? "pointer" : "not-allowed",
    minWidth: "88px",
    opacity: enabled ? 1 : 0.45,
  };
}

function snapToggleStyle(active) {
  return {
    background: active ? MONUMENT : WHITE,
    color: active ? PAGE_TEXT : MONUMENT,
    border: `1px solid ${UI.outline}`,
    borderRadius: "8px",
    padding: "8px 16px",
    fontSize: "0.95rem",
    fontWeight: 600,
    cursor: "pointer",
    minWidth: "88px",
  };
}

function pointFromEvent(el, e) {
  const r = el.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(r.width, e.clientX - r.left)),
    y: Math.max(0, Math.min(r.height, e.clientY - r.top)),
  };
}

/** Unit tangent/normal of the segment prev → last. */
function orthoAxes(prev, last) {
  const dx = last.x - prev.x;
  const dy = last.y - prev.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  return {
    tx: dx / len,
    ty: dy / len,
    nx: -dy / len,
    ny: dx / len,
  };
}

function projectOnAxis(origin, ux, uy, cursor) {
  const t = (cursor.x - origin.x) * ux + (cursor.y - origin.y) * uy;
  return { x: origin.x + ux * t, y: origin.y + uy * t };
}

function intersectAxes(p, ux, uy, q, vx, vy) {
  const det = ux * vy - uy * vx;
  if (Math.abs(det) < 1e-9) return null;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const a = (dx * vy - dy * vx) / det;
  return { x: p.x + a * ux, y: p.y + a * uy };
}

function clipAxisToRect(px, py, ux, uy, w, h) {
  if (w < 1 || h < 1) return null;
  if (Math.abs(ux) <= 1e-9 && Math.abs(uy) <= 1e-9) return null;
  if (Math.abs(ux) <= 1e-9 && px >= 0 && px <= w) {
    return { x1: px, y1: 0, x2: px, y2: h };
  }
  if (Math.abs(uy) <= 1e-9 && py >= 0 && py <= h) {
    return { x1: 0, y1: py, x2: w, y2: py };
  }
  const hits = [];
  const add = (t) => {
    const x = px + t * ux;
    const y = py + t * uy;
    if (x >= -0.51 && x <= w + 0.51 && y >= -0.51 && y <= h + 0.51) {
      hits.push({ x, y, t });
    }
  };
  if (Math.abs(ux) > 1e-9) {
    add((0 - px) / ux);
    add((w - px) / ux);
  }
  if (Math.abs(uy) > 1e-9) {
    add((0 - py) / uy);
    add((h - py) / uy);
  }
  if (hits.length < 2) return null;
  hits.sort((a, b) => a.t - b.t);
  const a = hits[0];
  const b = hits[hits.length - 1];
  if (Math.hypot(a.x - b.x, a.y - b.y) < 1) return null;
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

function collectOrthoGuides(vertices, cursor, width, height) {
  if (!vertices?.length || width < 1 || height < 1) return [];
  let ax = null;
  if (vertices.length >= 2) {
    ax = orthoAxes(vertices[vertices.length - 2], vertices[vertices.length - 1]);
  } else if (cursor) {
    ax = orthoAxes(vertices[0], cursor);
  }
  if (!ax) return [];
  const lines = [];
  for (let i = 0; i < vertices.length; i += 1) {
    const v = vertices[i];
    const tLine = clipAxisToRect(v.x, v.y, ax.tx, ax.ty, width, height);
    const nLine = clipAxisToRect(v.x, v.y, ax.nx, ax.ny, width, height);
    if (tLine) lines.push({ ...tLine, origin: i === 0 });
    if (nLine) lines.push({ ...nLine, origin: i === 0 });
  }
  return lines;
}

/** Project cursor onto the line through `last` that is 90° to the previous segment. */
function snapOrthogonalCursor(vertices, cursor, snap) {
  if (!snap || !vertices || vertices.length < 2) return cursor;
  const prev = vertices[vertices.length - 2];
  const last = vertices[vertices.length - 1];
  const ax = orthoAxes(prev, last);
  if (!ax) return cursor;
  let point = projectOnAxis(last, ax.nx, ax.ny, cursor);

  for (let i = 0; i < vertices.length; i += 1) {
    const v = vertices[i];
    if (Math.hypot(point.x - v.x, point.y - v.y) <= CLOSE_PX) {
      return { x: v.x, y: v.y };
    }
  }

  let best = null;
  let bestD = CLOSE_PX;
  for (let i = 0; i < vertices.length - 1; i += 1) {
    const v = vertices[i];
    const hits = [
      intersectAxes(last, ax.nx, ax.ny, v, ax.tx, ax.ty),
      intersectAxes(last, ax.nx, ax.ny, v, ax.nx, ax.ny),
    ];
    for (const hit of hits) {
      if (!hit) continue;
      const d = Math.hypot(point.x - hit.x, point.y - hit.y);
      if (d < bestD) {
        bestD = d;
        best = hit;
      }
    }
  }
  if (best) point = best;

  const prevLen = Math.hypot(last.x - prev.x, last.y - prev.y);
  if (prevLen > 1) {
    const s1 = { x: last.x + ax.nx * prevLen, y: last.y + ax.ny * prevLen };
    const s2 = { x: last.x - ax.nx * prevLen, y: last.y - ax.ny * prevLen };
    const nearer = Math.hypot(point.x - s1.x, point.y - s1.y) <= Math.hypot(point.x - s2.x, point.y - s2.y) ? s1 : s2;
    if (Math.hypot(point.x - nearer.x, point.y - nearer.y) <= CLOSE_PX) {
      return nearer;
    }
  }

  return point;
}

function rectFromPoints(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

function rectToVertices(r) {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

function edgeAxis(a, b) {
  return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? "h" : "v";
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-8) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function hitTestEdge(vertices, p, closed) {
  if (!vertices || vertices.length < 2) return null;
  const n = vertices.length;
  const count = closed ? n : n - 1;
  let best = null;
  let bestD = EDGE_HIT_PX;
  for (let i = 0; i < count; i += 1) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    const d = distToSegment(p, a, b);
    if (d <= bestD) {
      bestD = d;
      best = { index: i, axis: edgeAxis(a, b) };
    }
  }
  return best;
}

function moveEdgeAlongNormal(vertices, index, cursor) {
  const n = vertices.length;
  const a = vertices[index];
  const b = vertices[(index + 1) % n];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const next = vertices.map((p) => ({ x: p.x, y: p.y }));
  if (len < 1e-6) return next;
  const nx = -dy / len;
  const ny = dx / len;
  const dist = (cursor.x - a.x) * nx + (cursor.y - a.y) * ny;
  next[index] = { x: a.x + nx * dist, y: a.y + ny * dist };
  next[(index + 1) % n] = { x: b.x + nx * dist, y: b.y + ny * dist };
  return next;
}

function formatSqm(m2) {
  if (!(m2 > 0)) return "0 m²";
  const n = m2 >= 100 ? m2.toFixed(0) : m2 >= 10 ? m2.toFixed(1) : m2.toFixed(2);
  return `${n} m²`;
}

function formatMetres(m) {
  if (!(m > 0)) return "0 m";
  const n = m >= 100 ? m.toFixed(0) : m >= 10 ? m.toFixed(1) : m.toFixed(2);
  return `${n} m`;
}

function sideLengthLabels(pts, closed, ppm) {
  if (!pts || pts.length < 2 || !(ppm > 0)) return [];
  const n = pts.length;
  const count = closed ? n : n - 1;
  const center = polygonCentroid(pts);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const lenPx = Math.hypot(b.x - a.x, b.y - a.y);
    if (lenPx < 8) continue;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    let nx = a.y - b.y;
    let ny = b.x - a.x;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    if (nx * (center.x - mx) + ny * (center.y - my) > 0) {
      nx = -nx;
      ny = -ny;
    }
    out.push({
      key: `side-${i}`,
      x: mx + nx * 14,
      y: my + ny * 14,
      label: formatMetres(lenPx / ppm),
    });
  }
  return out;
}

function commitRect(next) {
  if (next.w >= MIN_SIZE_PX && next.h >= MIN_SIZE_PX) return next;
  return null;
}

function pointsNear(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= CLOSE_PX;
}

/** Shoelace area in square metres. */
function polygonAreaM2(pts, ppm = DEFAULT_PPM) {
  if (!pts || pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2 / (ppm * ppm);
}

function lerpPoint(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function clampRectFromPoints(start, end, maxM2, ppm = DEFAULT_PPM) {
  const r = rectFromPoints(start, end);
  if (!(maxM2 > 0) || !(r.w > 0) || !(r.h > 0)) return r;
  const area = (r.w / ppm) * (r.h / ppm);
  if (area <= maxM2 + 1e-9) return r;
  const maxPx = maxM2 * ppm * ppm;
  const scale = Math.sqrt(maxPx / (r.w * r.h));
  const nw = r.w * scale;
  const nh = r.h * scale;
  return rectFromPoints(start, {
    x: end.x >= start.x ? start.x + nw : start.x - nw,
    y: end.y >= start.y ? start.y + nh : start.y - nh,
  });
}

function clampPolygonPoint(vertices, cursor, maxM2, ppm = DEFAULT_PPM) {
  if (!(maxM2 > 0) || !vertices || vertices.length < 2) return cursor;
  if (polygonAreaM2([...vertices, cursor], ppm) <= maxM2 + 1e-9) return cursor;
  const last = vertices[vertices.length - 1];
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 28; i += 1) {
    const mid = (lo + hi) / 2;
    const p = lerpPoint(last, cursor, mid);
    if (polygonAreaM2([...vertices, p], ppm) <= maxM2) lo = mid;
    else hi = mid;
  }
  return lerpPoint(last, cursor, lo);
}

function clampEdgeMove(baseVerts, index, cursor, maxM2, ppm = DEFAULT_PPM) {
  const desired = moveEdgeAlongNormal(baseVerts, index, cursor);
  if (!(maxM2 > 0)) return desired;
  if (polygonAreaM2(desired, ppm) <= maxM2 + 1e-9) return desired;
  const start = baseVerts[index];
  const startArea = polygonAreaM2(baseVerts, ppm);
  const desiredArea = polygonAreaM2(desired, ppm);
  if (startArea > maxM2 + 1e-9) {
    return desiredArea <= startArea + 1e-9 ? desired : baseVerts.map((p) => ({ x: p.x, y: p.y }));
  }
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 28; i += 1) {
    const mid = (lo + hi) / 2;
    const p = lerpPoint(start, cursor, mid);
    if (polygonAreaM2(moveEdgeAlongNormal(baseVerts, index, p), ppm) <= maxM2) lo = mid;
    else hi = mid;
  }
  return moveEdgeAlongNormal(baseVerts, index, lerpPoint(start, cursor, lo));
}

function polygonCentroid(pts) {
  if (!pts?.length) return { x: 0, y: 0 };
  if (pts.length < 3) {
    const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return { x, y };
  }
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const cross = a.x * b.y - b.x * a.y;
    twiceArea += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(twiceArea) < 1e-6) {
    const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return { x, y };
  }
  return { x: cx / (3 * twiceArea), y: cy / (3 * twiceArea) };
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
  if (address) params.set("address", address);
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

function pixelsPerMetreFromMap(map) {
  const a = map.containerPointToLatLng(L.point(0, 0));
  const b = map.containerPointToLatLng(L.point(100, 0));
  const metres = map.distance(a, b);
  if (!(metres > 0.001)) return null;
  return 100 / metres;
}

function vertsToLatLngs(map, verts) {
  return verts.map((p) => {
    const ll = map.containerPointToLatLng(L.point(p.x, p.y));
    return { lat: ll.lat, lng: ll.lng };
  });
}

function latLngsToVerts(map, pts) {
  return pts.map((p) => {
    const pt = map.latLngToContainerPoint(L.latLng(p.lat, p.lng));
    return { x: pt.x, y: pt.y };
  });
}

function ChipLabel({ x, y, text, compact }) {
  return (
    <span
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: "translate(-50%, -50%)",
        background: WHITE,
        color: MONUMENT,
        border: `1px solid ${UI.outline}`,
        borderRadius: "8px",
        padding: compact ? "3px 8px" : "4px 10px",
        fontSize: compact ? "0.8rem" : "1.05rem",
        fontWeight: 700,
        letterSpacing: "0.02em",
        boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
        whiteSpace: "nowrap",
        pointerEvents: "none",
      }}
    >
      {text}
    </span>
  );
}

function AreaLabel({ x, y, areaM2, compact }) {
  return <ChipLabel x={x} y={y} text={formatSqm(areaM2)} compact={compact} />;
}

function formatRoomDims(w, h) {
  return `${w.toFixed(1)} × ${h.toFixed(1)}`;
}

function LengthLabel({ x, y, text }) {
  return (
    <span
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: "translate(-50%, -50%)",
        background: WHITE,
        color: MONUMENT,
        border: `1px solid ${UI.outline}`,
        borderRadius: "6px",
        padding: "2px 6px",
        fontSize: "0.72rem",
        fontWeight: 700,
        letterSpacing: "0.02em",
        boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
        whiteSpace: "nowrap",
        pointerEvents: "none",
      }}
    >
      {text}
    </span>
  );
}

function rotateAbout(verts, c, cos, sin) {
  return verts.map((p) => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
  });
}

function longestSideAngle(verts) {
  const n = verts.length;
  if (n < 2) return 0;
  let bestI = 0;
  let bestLen = -1;
  for (let i = 0; i < n; i += 1) {
    const a = verts[i];
    const b = verts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > bestLen) {
      bestLen = len;
      bestI = i;
    }
  }
  const a = verts[bestI];
  const b = verts[(bestI + 1) % n];
  let angle = Math.atan2(b.y - a.y, b.x - a.x);
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle < -Math.PI / 2) angle += Math.PI;
  return angle;
}

function captureDesignFrame(pixelVerts, srcPpm) {
  const unrotated = pixelVerts.map((p) => ({ x: p.x / srcPpm, y: p.y / srcPpm }));
  const angle = longestSideAngle(unrotated);
  const cosF = Math.cos(-angle);
  const sinF = Math.sin(-angle);
  const centroid = polygonCentroid(unrotated);
  return {
    metres: rotateAbout(unrotated, centroid, cosF, sinF),
    centroid,
    cosF,
    sinF,
    srcPpm,
  };
}

function designMetresToPixels(metres, frame) {
  const { centroid: c, cosF, sinF, srcPpm } = frame;
  return metres.map((p) => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    return {
      x: (c.x + dx * cosF + dy * sinF) * srcPpm,
      y: (c.y - dx * sinF + dy * cosF) * srcPpm,
    };
  });
}

function metreGridStyle(ppm, offsetX = 0, offsetY = 0) {
  const strong = "rgba(50, 50, 51, 0.22)";
  const weak = "rgba(50, 50, 51, 0.08)";
  return {
    backgroundColor: WHITE,
    backgroundImage: [
      `linear-gradient(to right, ${strong} 1px, transparent 1px)`,
      `linear-gradient(to bottom, ${strong} 1px, transparent 1px)`,
      `linear-gradient(to right, ${weak} 1px, transparent 1px)`,
      `linear-gradient(to bottom, ${weak} 1px, transparent 1px)`,
    ].join(", "),
    backgroundSize: `${ppm * 5}px ${ppm * 5}px, ${ppm * 5}px ${ppm * 5}px, ${ppm}px ${ppm}px, ${ppm}px ${ppm}px`,
    backgroundPosition: `${offsetX}px ${offsetY}px`,
  };
}

function layoutFromMetres(metres, width, height) {
  const PAD = 56;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of metres) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const bw = Math.max(maxX - minX, 0.01);
  const bh = Math.max(maxY - minY, 0.01);
  const innerW = Math.max(width - PAD * 2, 1);
  const innerH = Math.max(height - PAD * 2, 1);
  const scale = Math.min(DEFAULT_PPM, innerW / bw, innerH / bh);
  const originX = (width - bw * scale) / 2 - minX * scale;
  const originY = (height - bh * scale) / 2 - minY * scale;
  return {
    pts: metres.map((p) => ({ x: p.x * scale + originX, y: p.y * scale + originY })),
    metres,
    scale,
    originX,
    originY,
    offsetX: (width - bw * scale) / 2,
    offsetY: (height - bh * scale) / 2,
    areaM2: polygonAreaM2(metres, 1),
  };
}

const BEDROOM_W_M = 3.6;
const BEDROOM_H_M = 3.0;
const BATHROOM_W_M = 1.8;
const BATHROOM_H_M = 3.6;
const BED_SHORT_M = 1.8;
const BED_LONG_M = 2.0;
const SHOWER_LONG_M = 1.8;
const SHOWER_SHORT_M = 0.9;
const ROOM_MIN_M = 0.6;
const ROOM_BLUE = "#2563eb";
const ROOM_BLUE_FILL = "rgba(37, 99, 235, 0.32)";
const ROOM_PURPLE = "#7c3aed";
const ROOM_PURPLE_FILL = "rgba(124, 58, 237, 0.32)";

function roomKind(room) {
  return room?.kind === "bathroom" ? "bathroom" : "bedroom";
}

function roomColors(room) {
  if (roomKind(room) === "bathroom") {
    return { stroke: ROOM_PURPLE, fill: ROOM_PURPLE_FILL };
  }
  return { stroke: ROOM_BLUE, fill: ROOM_BLUE_FILL };
}

function nextRoomPlacement(rooms, metres, w, h) {
  const n = rooms.length;
  const b = buildingBounds(metres);
  const gap = 0.4;
  const cellW = Math.max(BEDROOM_W_M, BATHROOM_W_M) + gap;
  const cellH = Math.max(BEDROOM_H_M, BATHROOM_H_M) + gap;
  const cols = Math.max(1, Math.floor((b.maxX - b.minX + gap) / cellW));
  return {
    x: b.minX + (n % cols) * cellW,
    y: b.minY + Math.floor(n / cols) * cellH,
    w,
    h,
  };
}

function roomToPx(room, layout) {
  return {
    x: room.x * layout.scale + layout.originX,
    y: room.y * layout.scale + layout.originY,
    w: room.w * layout.scale,
    h: room.h * layout.scale,
  };
}

function pxToMetres(p, layout) {
  return {
    x: (p.x - layout.originX) / layout.scale,
    y: (p.y - layout.originY) / layout.scale,
  };
}

function handlePx(layout) {
  return Math.max(9, Math.min(13, layout.scale * 0.3));
}

function buildingSnapAxes(metres) {
  const xs = [];
  const ys = [];
  if (!metres?.length) return { xs, ys };
  const n = metres.length;
  for (let i = 0; i < n; i += 1) {
    const a = metres[i];
    const b = metres[(i + 1) % n];
    xs.push(a.x);
    ys.push(a.y);
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    if (dx <= dy * 0.2) {
      xs.push(a.x, b.x, (a.x + b.x) / 2);
    }
    if (dy <= dx * 0.2) {
      ys.push(a.y, b.y, (a.y + b.y) / 2);
    }
  }
  return { xs, ys };
}

function nearestSnap(v, list) {
  let best = v;
  let bestD = Infinity;
  for (const s of list) {
    const d = Math.abs(v - s);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return { value: best, dist: bestD };
}

function snapRoomMove(x, y, w, h, xs, ys, thresh) {
  const l = nearestSnap(x, xs);
  const r = nearestSnap(x + w, xs);
  const t = nearestSnap(y, ys);
  const b = nearestSnap(y + h, ys);
  let nx = x;
  let ny = y;
  if (l.dist <= r.dist) {
    if (l.dist <= thresh) nx = l.value;
  } else if (r.dist <= thresh) {
    nx = r.value - w;
  }
  if (t.dist <= b.dist) {
    if (t.dist <= thresh) ny = t.value;
  } else if (b.dist <= thresh) {
    ny = b.value - h;
  }
  return { x: nx, y: ny };
}

function snapRoomEdge(room, side, next, xs, ys, thresh) {
  const out = { ...room, ...next };
  if (out.w < ROOM_MIN_M) out.w = ROOM_MIN_M;
  if (out.h < ROOM_MIN_M) out.h = ROOM_MIN_M;
  if (side === "left") {
    const s = nearestSnap(out.x, xs);
    if (s.dist <= thresh) {
      const right = room.x + room.w;
      out.x = s.value;
      out.w = Math.max(ROOM_MIN_M, right - out.x);
    }
  } else if (side === "right") {
    const s = nearestSnap(out.x + out.w, xs);
    if (s.dist <= thresh) out.w = Math.max(ROOM_MIN_M, s.value - out.x);
  } else if (side === "top") {
    const s = nearestSnap(out.y, ys);
    if (s.dist <= thresh) {
      const bottom = room.y + room.h;
      out.y = s.value;
      out.h = Math.max(ROOM_MIN_M, bottom - out.y);
    }
  } else if (side === "bottom") {
    const s = nearestSnap(out.y + out.h, ys);
    if (s.dist <= thresh) out.h = Math.max(ROOM_MIN_M, s.value - out.y);
  }
  return out;
}

function rotateRoom90(room) {
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;
  const w = room.h;
  const h = room.w;
  return { ...room, x: cx - w / 2, y: cy - h / 2, w, h };
}

function buildingBounds(metres) {
  const xs = metres.map((p) => p.x);
  const ys = metres.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/** Bed 1.8m centered on the 3m side; 2.0m starts at one end of the 3.6m side. */
function bedInRoom(room) {
  const longIsX = room.w >= room.h;
  if (longIsX) {
    const w = Math.min(BED_LONG_M, room.w);
    const h = Math.min(BED_SHORT_M, room.h);
    return {
      x: room.x,
      y: room.y + Math.max(0, (room.h - h) / 2),
      w,
      h,
      longIsX: true,
    };
  }
  const w = Math.min(BED_SHORT_M, room.w);
  const h = Math.min(BED_LONG_M, room.h);
  return {
    x: room.x + Math.max(0, (room.w - w) / 2),
    y: room.y,
    w,
    h,
    longIsX: false,
  };
}

function BedroomBed({ room, layout }) {
  const bed = bedInRoom(room);
  const bx = bed.x * layout.scale + layout.originX;
  const by = bed.y * layout.scale + layout.originY;
  const bw = bed.w * layout.scale;
  const bh = bed.h * layout.scale;
  const rad = Math.max(2, layout.scale * 0.06);
  const pillow = bed.longIsX
    ? {
        x: bx + bw * 0.06,
        y: by + bh * 0.1,
        w: bw * 0.2,
        h: bh * 0.8,
      }
    : {
        x: bx + bw * 0.1,
        y: by + bh * 0.06,
        w: bw * 0.8,
        h: bh * 0.2,
      };
  return (
    <g>
      <rect
        x={bx}
        y={by}
        width={bw}
        height={bh}
        rx={rad}
        fill="#dbe7f8"
        stroke="#1d4ed8"
        strokeWidth="1.25"
      />
      <rect
        x={pillow.x}
        y={pillow.y}
        width={pillow.w}
        height={pillow.h}
        rx={rad * 0.8}
        fill="#f8fafc"
        stroke="#3b82f6"
        strokeWidth="1"
      />
    </g>
  );
}

function mRectToPx(rect, layout) {
  return {
    x: rect.x * layout.scale + layout.originX,
    y: rect.y * layout.scale + layout.originY,
    w: rect.w * layout.scale,
    h: rect.h * layout.scale,
  };
}

function bathroomFixtures(room) {
  const longIsX = room.w >= room.h;
  const showerW = longIsX
    ? Math.min(SHOWER_SHORT_M, room.w)
    : Math.min(SHOWER_LONG_M, room.w);
  const showerH = longIsX
    ? Math.min(SHOWER_LONG_M, room.h)
    : Math.min(SHOWER_SHORT_M, room.h);
  const shower = { x: room.x, y: room.y, w: showerW, h: showerH };
  const inset = 0.04;
  if (longIsX) {
    const tankW = Math.min(0.18, Math.max(0.1, room.w * 0.12));
    const tankH = Math.min(0.5, Math.max(0.28, room.h * 0.28));
    const tank = {
      x: room.x + room.w - tankW - inset,
      y: room.y + room.h - tankH - inset,
      w: tankW,
      h: tankH,
    };
    const bowlW = Math.min(0.42, Math.max(0.22, room.w * 0.22));
    const bowlH = Math.min(tankH * 0.78, tank.h);
    const bowl = {
      x: tank.x - bowlW + 0.03,
      y: tank.y + (tank.h - bowlH) / 2,
      w: bowlW,
      h: bowlH,
    };
    return { shower, tank, bowl };
  }
  const tankW = Math.min(0.5, Math.max(0.28, room.w * 0.28));
  const tankH = Math.min(0.18, Math.max(0.1, room.h * 0.08));
  const tank = {
    x: room.x + room.w - tankW - inset,
    y: room.y + room.h - tankH - inset,
    w: tankW,
    h: tankH,
  };
  const bowlH = Math.min(0.42, Math.max(0.22, room.h * 0.16));
  const bowlW = Math.min(tankW * 0.78, tank.w);
  const bowl = {
    x: tank.x + (tank.w - bowlW) / 2,
    y: tank.y - bowlH + 0.03,
    w: bowlW,
    h: bowlH,
  };
  return { shower, tank, bowl };
}

function BathroomFixtures({ room, layout }) {
  const { shower, tank, bowl } = bathroomFixtures(room);
  const s = mRectToPx(shower, layout);
  const t = mRectToPx(tank, layout);
  const b = mRectToPx(bowl, layout);
  const rad = Math.max(2, layout.scale * 0.05);
  const drainR = Math.max(2, Math.min(s.w, s.h) * 0.07);
  return (
    <g>
      <rect
        x={s.x}
        y={s.y}
        width={s.w}
        height={s.h}
        fill="#edd9ff"
        stroke="#6d28d9"
        strokeWidth="1.25"
      />
      <rect
        x={s.x + s.w * 0.08}
        y={s.y + s.h * 0.08}
        width={s.w * 0.84}
        height={s.h * 0.84}
        fill="none"
        stroke="#c4b5fd"
        strokeWidth="1"
        strokeDasharray="4 3"
      />
      <circle
        cx={s.x + s.w / 2}
        cy={s.y + s.h / 2}
        r={drainR}
        fill="none"
        stroke="#6d28d9"
        strokeWidth="1.1"
      />
      <circle
        cx={s.x + s.w / 2}
        cy={s.y + s.h / 2}
        r={Math.max(1, drainR * 0.35)}
        fill="#6d28d9"
      />
      <rect
        x={t.x}
        y={t.y}
        width={t.w}
        height={t.h}
        rx={rad * 0.6}
        fill="#faf5ff"
        stroke="#6d28d9"
        strokeWidth="1.2"
      />
      <ellipse
        cx={b.x + b.w / 2}
        cy={b.y + b.h / 2}
        rx={b.w / 2}
        ry={b.h / 2}
        fill="#faf5ff"
        stroke="#6d28d9"
        strokeWidth="1.2"
      />
    </g>
  );
}

function hitRoomHandle(r, p, size) {
  const pad = 2;
  if (
    p.x >= r.x + pad &&
    p.x <= r.x + pad + size &&
    p.y >= r.y + pad &&
    p.y <= r.y + pad + size
  ) {
    return "move";
  }
  if (
    p.x >= r.x + r.w - pad - size &&
    p.x <= r.x + r.w - pad &&
    p.y >= r.y + pad &&
    p.y <= r.y + pad + size
  ) {
    return "rotate";
  }
  return null;
}

function roomSideFromEdge(index) {
  if (index === 0) return "top";
  if (index === 1) return "right";
  if (index === 2) return "bottom";
  return "left";
}

function DesignModal({
  vertices,
  ppm,
  rooms,
  onRoomsChange,
  nextIdRef,
  onBuildingChange,
  maxAreaM2 = 0,
  onClose,
}) {
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const roomsRef = useRef(rooms);
  const layoutRef = useRef(null);
  const frameRef = useRef(null);
  const freezeLayoutRef = useRef(null);
  if (!frameRef.current && vertices.length >= 3) {
    frameRef.current = captureDesignFrame(vertices, ppm);
  }
  const [buildingMetres, setBuildingMetres] = useState(
    () => frameRef.current?.metres || []
  );
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState(null);
  roomsRef.current = rooms;

  const applyBuildingMetres = useCallback(
    (nextMetres) => {
      setBuildingMetres(nextMetres);
      const frame = frameRef.current;
      if (frame && onBuildingChange) {
        onBuildingChange(designMetresToPixels(nextMetres, frame));
      }
    },
    [onBuildingChange]
  );

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const refresh = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    refresh();
    const observer = new ResizeObserver(refresh);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const layout = (() => {
    if (!(size.w > 0 && size.h > 0 && buildingMetres.length >= 3)) return null;
    const live = layoutFromMetres(buildingMetres, size.w, size.h);
    const frozen = freezeLayoutRef.current;
    if (!frozen) return live;
    return {
      ...live,
      scale: frozen.scale,
      originX: frozen.originX,
      originY: frozen.originY,
      offsetX: frozen.offsetX,
      offsetY: frozen.offsetY,
      pts: buildingMetres.map((p) => ({
        x: p.x * frozen.scale + frozen.originX,
        y: p.y * frozen.scale + frozen.originY,
      })),
    };
  })();
  layoutRef.current = layout;
  const center = layout ? polygonCentroid(layout.pts) : { x: 0, y: 0 };
  const snapAxes = layout ? buildingSnapAxes(layout.metres) : { xs: [], ys: [] };
  const snapThreshM = layout ? Math.max(0.08, 10 / layout.scale) : 0.12;
  const buildingSideLabels = layout
    ? sideLengthLabels(layout.pts, true, layout.scale)
    : [];

  const addRoom = useCallback(
    (kind, w, h) => {
      const current = layoutRef.current;
      if (!current) return;
      const placed = nextRoomPlacement(roomsRef.current, current.metres, w, h);
      nextIdRef.current += 1;
      const room = {
        id: `${kind}-${nextIdRef.current}`,
        kind,
        ...placed,
      };
      onRoomsChange((prev) => prev.concat(room));
    },
    [nextIdRef, onRoomsChange]
  );

  const addBedroom = useCallback(() => {
    addRoom("bedroom", BEDROOM_W_M, BEDROOM_H_M);
  }, [addRoom]);

  const addBathroom = useCallback(() => {
    addRoom("bathroom", BATHROOM_W_M, BATHROOM_H_M);
  }, [addRoom]);

  const updateRoom = useCallback(
    (id, next) => {
      onRoomsChange((prev) => prev.map((r) => (r.id === id ? next : r)));
    },
    [onRoomsChange]
  );

  const onStagePointerDown = useCallback(
    (e) => {
      if (e.button !== 0 || !layout) return;
      const el = stageRef.current;
      if (!el) return;
      const raw = pointFromEvent(el, e);
      const hs = handlePx(layout);
      for (let i = roomsRef.current.length - 1; i >= 0; i -= 1) {
        const room = roomsRef.current[i];
        const r = roomToPx(room, layout);
        const handle = hitRoomHandle(r, raw, hs);
        if (handle === "rotate") {
          e.preventDefault();
          const rotated = rotateRoom90(room);
          const snapped = snapRoomMove(
            rotated.x,
            rotated.y,
            rotated.w,
            rotated.h,
            snapAxes.xs,
            snapAxes.ys,
            snapThreshM
          );
          updateRoom(room.id, { ...rotated, ...snapped });
          return;
        }
        if (handle === "move") {
          e.preventDefault();
          el.setPointerCapture(e.pointerId);
          const grab = pxToMetres(raw, layout);
          dragRef.current = {
            mode: "move",
            id: room.id,
            grab,
            start: { ...room },
          };
          return;
        }
        const verts = [
          { x: r.x, y: r.y },
          { x: r.x + r.w, y: r.y },
          { x: r.x + r.w, y: r.y + r.h },
          { x: r.x, y: r.y + r.h },
        ];
        const edge = hitTestEdge(verts, raw, true);
        if (edge) {
          e.preventDefault();
          el.setPointerCapture(e.pointerId);
          dragRef.current = {
            mode: "edge",
            id: room.id,
            side: roomSideFromEdge(edge.index),
            start: { ...room },
          };
          return;
        }
      }
      const buildingHit = hitTestEdge(layout.pts, raw, true);
      if (buildingHit) {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        freezeLayoutRef.current = {
          scale: layout.scale,
          originX: layout.originX,
          originY: layout.originY,
          offsetX: layout.offsetX,
          offsetY: layout.offsetY,
        };
        dragRef.current = {
          mode: "building-edge",
          index: buildingHit.index,
          metres: buildingMetres.map((p) => ({ x: p.x, y: p.y })),
        };
        setHover({
          id: "building",
          kind: buildingHit.axis === "h" ? "ns" : "ew",
          edgeIndex: buildingHit.index,
        });
      }
    },
    [buildingMetres, layout, snapAxes.xs, snapAxes.ys, snapThreshM, updateRoom]
  );

  const onStagePointerMove = useCallback(
    (e) => {
      if (!layout) return;
      const el = stageRef.current;
      if (!el) return;
      const raw = pointFromEvent(el, e);
      const cursorM = pxToMetres(raw, layout);
      const drag = dragRef.current;
      const hs = handlePx(layout);

      if (drag?.mode === "move") {
        const nx = drag.start.x + (cursorM.x - drag.grab.x);
        const ny = drag.start.y + (cursorM.y - drag.grab.y);
        const snapped = snapRoomMove(
          nx,
          ny,
          drag.start.w,
          drag.start.h,
          snapAxes.xs,
          snapAxes.ys,
          snapThreshM
        );
        updateRoom(drag.id, { ...drag.start, ...snapped });
        setHover({ id: drag.id, kind: "move" });
        return;
      }
      if (drag?.mode === "edge") {
        const start = drag.start;
        let next = { ...start };
        if (drag.side === "left") {
          const right = start.x + start.w;
          next.x = Math.min(cursorM.x, right - ROOM_MIN_M);
          next.w = right - next.x;
        } else if (drag.side === "right") {
          next.w = Math.max(ROOM_MIN_M, cursorM.x - start.x);
        } else if (drag.side === "top") {
          const bottom = start.y + start.h;
          next.y = Math.min(cursorM.y, bottom - ROOM_MIN_M);
          next.h = bottom - next.y;
        } else if (drag.side === "bottom") {
          next.h = Math.max(ROOM_MIN_M, cursorM.y - start.y);
        }
        next = snapRoomEdge(start, drag.side, next, snapAxes.xs, snapAxes.ys, snapThreshM);
        updateRoom(drag.id, { ...start, ...next });
        setHover({
          id: drag.id,
          kind: drag.side === "top" || drag.side === "bottom" ? "ns" : "ew",
        });
        return;
      }
      if (drag?.mode === "building-edge") {
        const moved = clampEdgeMove(
          drag.metres,
          drag.index,
          cursorM,
          maxAreaM2,
          1
        );
        applyBuildingMetres(moved);
        const a = layout.pts[drag.index];
        const b = layout.pts[(drag.index + 1) % layout.pts.length];
        setHover({
          id: "building",
          kind: a && b && edgeAxis(a, b) === "h" ? "ns" : "ew",
          edgeIndex: drag.index,
        });
        return;
      }

      let nextHover = null;
      for (let i = roomsRef.current.length - 1; i >= 0; i -= 1) {
        const room = roomsRef.current[i];
        const r = roomToPx(room, layout);
        const handle = hitRoomHandle(r, raw, hs);
        if (handle === "move") {
          nextHover = { id: room.id, kind: "move" };
          break;
        }
        if (handle === "rotate") {
          nextHover = { id: room.id, kind: "rotate" };
          break;
        }
        const verts = [
          { x: r.x, y: r.y },
          { x: r.x + r.w, y: r.y },
          { x: r.x + r.w, y: r.y + r.h },
          { x: r.x, y: r.y + r.h },
        ];
        const edge = hitTestEdge(verts, raw, true);
        if (edge) {
          nextHover = { id: room.id, kind: edge.axis === "h" ? "ns" : "ew" };
          break;
        }
      }
      if (!nextHover) {
        const buildingHit = hitTestEdge(layout.pts, raw, true);
        if (buildingHit) {
          nextHover = {
            id: "building",
            kind: buildingHit.axis === "h" ? "ns" : "ew",
            edgeIndex: buildingHit.index,
          };
        }
      }
      setHover(nextHover);
    },
    [applyBuildingMetres, layout, maxAreaM2, snapAxes.xs, snapAxes.ys, snapThreshM, updateRoom]
  );

  const onStagePointerUp = useCallback((e) => {
    const el = stageRef.current;
    if (el && e?.pointerId != null) {
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    }
    const wasBuilding = dragRef.current?.mode === "building-edge";
    dragRef.current = null;
    freezeLayoutRef.current = null;
    if (wasBuilding) {
      setBuildingMetres((prev) => prev.map((p) => ({ x: p.x, y: p.y })));
    }
  }, []);

  const stageCursor =
    hover?.kind === "move"
      ? "grab"
      : hover?.kind === "rotate"
        ? "pointer"
        : hover?.kind === "ns"
          ? "ns-resize"
          : hover?.kind === "ew"
            ? "ew-resize"
            : "default";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-concept-design-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10050,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        boxSizing: "border-box",
        background: "rgba(0,0,0,0.5)",
      }}
    >
      <div
        style={{
          width: "min(1400px, calc(100vw - 40px))",
          height: "calc(100vh - 40px)",
          maxHeight: "100%",
          background: SECTION_GREY,
          borderRadius: "18px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: `1px solid ${EXPLORER_BORDER}`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "14px 18px",
            borderBottom: `1px solid ${EXPLORER_BORDER}`,
            background: "#f3f3f3",
            flexShrink: 0,
          }}
        >
          <h2
            id="quick-concept-design-title"
            style={{
              margin: 0,
              fontSize: "1.25rem",
              fontWeight: 700,
              color: MONUMENT,
            }}
          >
            Design
          </h2>
          <div
            style={{
              marginLeft: "16px",
              fontSize: "0.85rem",
              fontWeight: 600,
              color: "#666",
            }}
          >
            Drag a building side to adjust — it updates the map
          </div>
        </div>
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <div
            style={{
              width: "200px",
              flexShrink: 0,
              background: "#f3f3f3",
              borderRight: `1px solid ${EXPLORER_BORDER}`,
              padding: "16px 12px",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
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
              Rooms
            </div>
            <button
              type="button"
              onClick={addBedroom}
              disabled={!layout}
              style={{
                ...toolbarButtonStyle(Boolean(layout)),
                width: "100%",
                minWidth: 0,
              }}
            >
              Add Bedroom
            </button>
            <button
              type="button"
              onClick={addBathroom}
              disabled={!layout}
              style={{
                ...toolbarButtonStyle(Boolean(layout)),
                width: "100%",
                minWidth: 0,
              }}
            >
              Add Bathroom
            </button>
            {rooms.map((room, index) => {
              const kind = roomKind(room);
              const n = rooms.slice(0, index + 1).filter((r) => roomKind(r) === kind).length;
              const colors = roomColors(room);
              return (
                <div
                  key={room.id}
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: colors.stroke,
                    padding: "4px 2px",
                  }}
                >
                  {kind === "bathroom" ? "Bathroom" : "Bedroom"} {n}
                </div>
              );
            })}
          </div>
          <div
            ref={stageRef}
            onPointerDown={onStagePointerDown}
            onPointerMove={onStagePointerMove}
            onPointerUp={onStagePointerUp}
            onPointerCancel={onStagePointerUp}
            onPointerLeave={() => {
              if (!dragRef.current) setHover(null);
            }}
            style={{
              position: "relative",
              flex: 1,
              minHeight: 0,
              cursor: stageCursor,
              touchAction: "none",
              userSelect: "none",
              ...(layout
                ? metreGridStyle(layout.scale, layout.offsetX, layout.offsetY)
                : { backgroundColor: WHITE }),
            }}
          >
            {layout ? (
              <>
                <svg
                  width="100%"
                  height="100%"
                  style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
                >
                  <polygon
                    points={layout.pts.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="rgba(50, 50, 51, 0.08)"
                    stroke={MONUMENT}
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  {hover?.id === "building" && hover.edgeIndex != null ? (
                    <line
                      x1={layout.pts[hover.edgeIndex].x}
                      y1={layout.pts[hover.edgeIndex].y}
                      x2={layout.pts[(hover.edgeIndex + 1) % layout.pts.length].x}
                      y2={layout.pts[(hover.edgeIndex + 1) % layout.pts.length].y}
                      stroke="#ca8a04"
                      strokeWidth="4"
                      strokeLinecap="round"
                    />
                  ) : null}
                  {rooms.map((room) => {
                    const r = roomToPx(room, layout);
                    const hs = handlePx(layout);
                    const pad = 2;
                    const active = hover?.id === room.id;
                    const colors = roomColors(room);
                    const isBathroom = roomKind(room) === "bathroom";
                    return (
                      <g key={room.id}>
                        <rect
                          x={r.x}
                          y={r.y}
                          width={r.w}
                          height={r.h}
                          fill={colors.fill}
                          stroke={colors.stroke}
                          strokeWidth={active ? 2.5 : 2}
                        />
                        {isBathroom ? (
                          <BathroomFixtures room={room} layout={layout} />
                        ) : (
                          <BedroomBed room={room} layout={layout} />
                        )}
                        <rect
                          x={r.x + pad}
                          y={r.y + pad}
                          width={hs}
                          height={hs}
                          fill={colors.stroke}
                          stroke={WHITE}
                          strokeWidth="1"
                        />
                        <g
                          transform={`translate(${r.x + r.w - pad - hs / 2}, ${r.y + pad + hs / 2})`}
                        >
                          <circle r={hs / 2 + 1} fill={WHITE} stroke={colors.stroke} strokeWidth="1.5" />
                          <path
                            d={`M ${-hs * 0.22} ${-hs * 0.08} A ${hs * 0.28} ${hs * 0.28} 0 1 1 ${hs * 0.08} ${-hs * 0.22}`}
                            fill="none"
                            stroke={colors.stroke}
                            strokeWidth="1.6"
                            strokeLinecap="round"
                          />
                          <path
                            d={`M ${hs * 0.08} ${-hs * 0.38} L ${hs * 0.08} ${-hs * 0.08} L ${-hs * 0.16} ${-hs * 0.22}`}
                            fill={colors.stroke}
                          />
                        </g>
                      </g>
                    );
                  })}
                </svg>
                {layout.areaM2 > 0 ? (
                  <AreaLabel x={center.x} y={center.y} areaM2={layout.areaM2} />
                ) : null}
                {buildingSideLabels.map((side) => (
                  <LengthLabel key={side.key} x={side.x} y={side.y} text={side.label} />
                ))}
                {rooms.map((room) => {
                  const r = roomToPx(room, layout);
                  return (
                    <ChipLabel
                      key={`${room.id}-label`}
                      x={r.x + r.w / 2}
                      y={r.y + r.h / 2}
                      text={formatRoomDims(room.w, room.h)}
                      compact
                    />
                  );
                })}
                <div
                  style={{
                    position: "absolute",
                    left: 10,
                    bottom: 10,
                    background: "rgba(255,255,255,0.92)",
                    border: `1px solid ${EXPLORER_BORDER}`,
                    borderRadius: "8px",
                    padding: "4px 8px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: MONUMENT,
                    pointerEvents: "none",
                  }}
                >
                  1 square = 1 m
                </div>
              </>
            ) : null}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            padding: "12px 18px",
            borderTop: `1px solid ${EXPLORER_BORDER}`,
            background: "#f3f3f3",
            flexShrink: 0,
          }}
        >
          <button type="button" onClick={onClose} style={toolbarButtonStyle(true)}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function ParcelOutline({ feature }) {
  const map = useMap();
  useEffect(() => {
    if (!feature?.geometry) return undefined;
    let layer = null;
    try {
      layer = L.geoJSON(feature, {
        style: PARCEL_BOUNDARY_STYLE,
        interactive: false,
      });
      layer.addTo(map);
    } catch (err) {
      console.error("[QuickConcept] parcel outline failed:", err);
    }
    return () => {
      if (layer) map.removeLayer(layer);
    };
  }, [feature, map]);
  return null;
}

/** Fit the title boundary in the drawing area, then report metres-per-pixel. */
function MapFitAndScale({ bounds, center, fitKey, onViewReady }) {
  const map = useMap();
  const onViewReadyRef = useRef(onViewReady);
  onViewReadyRef.current = onViewReady;

  const boundsKey =
    bounds?.length === 2 && bounds[0]?.length === 2 && bounds[1]?.length === 2
      ? `${bounds[0][0]},${bounds[0][1]},${bounds[1][0]},${bounds[1][1]}`
      : "";
  const centerKey = center?.length === 2 ? `${center[0]},${center[1]}` : "";

  const apply = useCallback(() => {
    map.invalidateSize({ animate: false });
    try {
      if (boundsKey && bounds) {
        const size = map.getSize();
        const pad = Math.max(40, Math.round(Math.min(size.x, size.y) * 0.08));
        map.fitBounds(bounds, {
          padding: [pad, pad],
          animate: false,
          maxZoom: MAP_MAX_ZOOM,
        });
      } else if (center) {
        map.setView(center, Math.min(SEARCH_ZOOM, map.getMaxZoom()), { animate: false });
      }
    } catch {
      /* ignore fit errors */
    }
    const ppm = pixelsPerMetreFromMap(map);
    if (ppm) onViewReadyRef.current(map, ppm);
  }, [map, bounds, boundsKey, center]);

  useEffect(() => {
    const frameId = requestAnimationFrame(apply);
    const t1 = window.setTimeout(apply, 80);
    const t2 = window.setTimeout(apply, 280);
    return () => {
      cancelAnimationFrame(frameId);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [apply, fitKey, boundsKey, centerKey]);

  useEffect(() => {
    const parent = map.getContainer().parentElement;
    if (!parent) return undefined;
    let timer = null;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(apply, 60);
    });
    observer.observe(parent);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [map, apply]);

  return null;
}

function MapViewSync({ onViewReady }) {
  const map = useMap();
  const onViewReadyRef = useRef(onViewReady);
  onViewReadyRef.current = onViewReady;

  useEffect(() => {
    const report = () => {
      const ppm = pixelsPerMetreFromMap(map);
      if (ppm) onViewReadyRef.current(map, ppm);
    };
    map.on("zoomend", report);
    map.on("moveend", report);
    return () => {
      map.off("zoomend", report);
      map.off("moveend", report);
    };
  }, [map]);

  return null;
}

export default function QuickConcept() {
  const logo = useAppLogo();
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const snapRef = useRef(true);
  const maxAreaRef = useRef(true);
  const toolRef = useRef("rectangle");
  const polyRef = useRef({ vertices: [], closed: false });
  const ppmRef = useRef(DEFAULT_PPM);
  const mapRef = useRef(null);
  const geoPolyRef = useRef([]);
  const [tool, setTool] = useState("rectangle");
  const [rect, setRect] = useState(null);
  const [draft, setDraft] = useState(null);
  const [placing, setPlacing] = useState(false);
  const [snap, setSnap] = useState(true);
  const [maxArea, setMaxArea] = useState(true);
  const [polyVertices, setPolyVertices] = useState([]);
  const [polyCursor, setPolyCursor] = useState(null);
  const [polyClosed, setPolyClosed] = useState(false);
  const [hoverEdge, setHoverEdge] = useState(null);
  const [ppm, setPpm] = useState(DEFAULT_PPM);
  const [design, setDesign] = useState(null);
  const [designRooms, setDesignRooms] = useState([]);
  const bedroomIdRef = useRef(0);

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [parcelLoading, setParcelLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resultLabel, setResultLabel] = useState("");
  const [parcelNotice, setParcelNotice] = useState("");
  const [mapCenter, setMapCenter] = useState(null);
  const [parcelFeature, setParcelFeature] = useState(null);
  const [parcelBounds, setParcelBounds] = useState(null);
  const [easementsGeoJson, setEasementsGeoJson] = useState(null);
  const [searchKey, setSearchKey] = useState("");
  const [basemapConfig, setBasemapConfig] = useState({
    nearmapEnabled: false,
    defaultBasemapId: DEFAULT_BASEMAP_ID,
  });
  const [basemapId, setBasemapId] = useState(DEFAULT_BASEMAP_ID);

  snapRef.current = snap;
  maxAreaRef.current = maxArea;
  toolRef.current = tool;
  polyRef.current = { vertices: polyVertices, closed: polyClosed };
  ppmRef.current = ppm;

  const showMap = Boolean(mapCenter);
  const resolvedBasemapId = resolveBasemapId(basemapId, basemapConfig);

  const shownRect = tool === "rectangle" ? draft : null;
  const rectAreaM2 = shownRect ? (shownRect.w / ppm) * (shownRect.h / ppm) : 0;

  const committedPoly = polyClosed && polyVertices.length >= 3;
  const livePoly =
    tool === "polygon" && !polyClosed && polyCursor && polyVertices.length
      ? [...polyVertices, polyCursor]
      : polyVertices;
  const polyPts = livePoly.length >= 2 ? livePoly : [];
  const displayPoly = committedPoly ? polyVertices : tool === "polygon" ? polyPts : [];
  const polyAreaM2 = polygonAreaM2(displayPoly.length >= 3 ? displayPoly : [], ppm);
  const polyCenter = polygonCentroid(displayPoly.length >= 3 ? displayPoly : displayPoly);
  const hasShape =
    (shownRect && shownRect.w >= MIN_SIZE_PX && shownRect.h >= MIN_SIZE_PX) ||
    polyVertices.length > 0;
  const canDesign = committedPoly;
  const drawingGuides =
    tool === "polygon" && !polyClosed && polyVertices.length
      ? collectOrthoGuides(
          polyVertices,
          polyCursor,
          canvasRef.current?.offsetWidth || 0,
          canvasRef.current?.offsetHeight || 0
        )
      : [];
  const rectSideLabels =
    shownRect && shownRect.w >= MIN_SIZE_PX && shownRect.h >= MIN_SIZE_PX
      ? sideLengthLabels(rectToVertices(shownRect), true, ppm)
      : [];
  const polySideLabels =
    displayPoly.length >= 2 ? sideLengthLabels(displayPoly, Boolean(polyClosed), ppm) : [];

  const syncGeoFromPixels = useCallback((verts) => {
    const map = mapRef.current;
    if (!map || !verts?.length) {
      geoPolyRef.current = [];
      return;
    }
    geoPolyRef.current = vertsToLatLngs(map, verts);
  }, []);

  const toPoint = useCallback((el, e) => pointFromEvent(el, e), []);
  const areaLimit = useCallback(() => (maxAreaRef.current ? MAX_AREA_M2 : 0), []);
  const limitedRect = useCallback((start, end) => {
    return clampRectFromPoints(start, end, areaLimit(), ppmRef.current);
  }, [areaLimit]);
  const limitedPolyPoint = useCallback((vertices, cursor) => {
    const snapped = snapOrthogonalCursor(vertices, cursor, snapRef.current);
    return clampPolygonPoint(vertices, snapped, areaLimit(), ppmRef.current);
  }, [areaLimit]);

  const commitShape = useCallback((verts) => {
    setDraft(null);
    setRect(null);
    setPlacing(false);
    setPolyVertices(verts);
    setPolyCursor(null);
    setPolyClosed(true);
    polyRef.current = { vertices: verts, closed: true };
    syncGeoFromPixels(verts);
  }, [syncGeoFromPixels]);

  const clearAll = useCallback(() => {
    dragRef.current = null;
    geoPolyRef.current = [];
    setPlacing(false);
    setDraft(null);
    setRect(null);
    setPolyVertices([]);
    setPolyCursor(null);
    setPolyClosed(false);
    setHoverEdge(null);
    polyRef.current = { vertices: [], closed: false };
  }, []);

  const applyDesignBuilding = useCallback(
    (pixelVerts) => {
      if (!pixelVerts || pixelVerts.length < 3) return;
      setPolyVertices(pixelVerts);
      polyRef.current = { vertices: pixelVerts, closed: true };
      syncGeoFromPixels(pixelVerts);
    },
    [syncGeoFromPixels]
  );

  const closeDesign = useCallback(() => {
    setDesign(null);
  }, []);

  const openDesign = useCallback(() => {
    const { vertices, closed } = polyRef.current;
    if (!closed || vertices.length < 3) return;
    bedroomIdRef.current = 0;
    setDesignRooms([]);
    setDesign({
      vertices: vertices.map((p) => ({ x: p.x, y: p.y })),
      ppm: ppmRef.current,
    });
  }, []);

  const selectTool = useCallback(
    (next) => {
      if (next === tool) return;
      clearAll();
      setTool(next);
    },
    [clearAll, tool]
  );

  const finishRectAt = useCallback((point) => {
    const drag = dragRef.current;
    if (!drag) return;
    const next = commitRect(limitedRect(drag.start, point));
    dragRef.current = null;
    setPlacing(false);
    setDraft(null);
    setRect(null);
    if (next) commitShape(rectToVertices(next));
  }, [commitShape, limitedRect]);

  const closePolygon = useCallback((pts) => {
    if (!pts || pts.length < 3) return false;
    if (!(polygonAreaM2(pts, ppmRef.current) > 0)) return false;
    setPolyVertices(pts);
    setPolyCursor(null);
    setPolyClosed(true);
    polyRef.current = { vertices: pts, closed: true };
    syncGeoFromPixels(pts);
    return true;
  }, [syncGeoFromPixels]);

  const undoPolygonNode = useCallback(() => {
    const { vertices, closed } = polyRef.current;
    if (closed || toolRef.current !== "polygon" || !vertices.length) return;
    const next = vertices.slice(0, -1);
    setPolyVertices(next);
    polyRef.current = { vertices: next, closed: false };
    if (!next.length) {
      setPolyCursor(null);
      geoPolyRef.current = [];
    } else {
      syncGeoFromPixels(next);
    }
  }, [syncGeoFromPixels]);

  const cancelPolygonDraw = useCallback(() => {
    if (polyRef.current.closed || toolRef.current !== "polygon") return;
    dragRef.current = null;
    geoPolyRef.current = [];
    setPolyVertices([]);
    setPolyCursor(null);
    setPolyClosed(false);
    setHoverEdge(null);
    polyRef.current = { vertices: [], closed: false };
  }, []);

  const onPointerDown = useCallback(
    (e) => {
      if (e.button !== 0) return;
      const el = canvasRef.current;
      if (!el) return;
      e.preventDefault();

      const raw = pointFromEvent(el, e);
      const point = raw;

      const { vertices, closed } = polyRef.current;
      if (closed && vertices.length >= 2) {
        const hit = hitTestEdge(vertices, raw, true);
        if (hit) {
          el.setPointerCapture(e.pointerId);
          dragRef.current = {
            mode: "edge",
            pointerId: e.pointerId,
            index: hit.index,
            vertices: vertices.map((p) => ({ x: p.x, y: p.y })),
          };
          setHoverEdge(hit);
          setPlacing(false);
          return;
        }
      }

      if (toolRef.current === "polygon") {
        if (closed) {
          setPolyVertices([point]);
          setPolyCursor(point);
          setPolyClosed(false);
          polyRef.current = { vertices: [point], closed: false };
          syncGeoFromPixels([]);
          return;
        }
        if (vertices.length >= 3 && pointsNear(point, vertices[0])) {
          closePolygon(vertices);
          return;
        }
        const last = vertices[vertices.length - 1];
        if (last && pointsNear(point, last)) return;
        const placed = limitedPolyPoint(vertices, point);
        if (last && pointsNear(placed, last)) return;
        const next = [...vertices, placed];
        setPolyVertices(next);
        setPolyCursor(placed);
        polyRef.current = { vertices: next, closed: false };
        syncGeoFromPixels(next);
        return;
      }

      if (dragRef.current?.mode === "placing") {
        finishRectAt(point);
        return;
      }
      if (closed) {
        setPolyVertices([]);
        setPolyClosed(false);
        polyRef.current = { vertices: [], closed: false };
        syncGeoFromPixels([]);
      }
      const map = mapRef.current;
      el.setPointerCapture(e.pointerId);
      dragRef.current = {
        start: point,
        startRaw: raw,
        startGeo: map ? vertsToLatLngs(map, [point])[0] : null,
        pointerId: e.pointerId,
        mode: "press",
        maxDist: 0,
      };
      setDraft({ x: point.x, y: point.y, w: 0, h: 0 });
    },
    [closePolygon, finishRectAt, limitedPolyPoint, syncGeoFromPixels]
  );

  const onPointerMove = useCallback((e) => {
    const el = canvasRef.current;
    if (!el) return;
    const drag = dragRef.current;
    const raw = pointFromEvent(el, e);
    const point = raw;

    if (drag?.mode === "edge") {
      const moved = clampEdgeMove(
        drag.vertices,
        drag.index,
        raw,
        areaLimit(),
        ppmRef.current
      );
      setPolyVertices(moved);
      polyRef.current = { vertices: moved, closed: true };
      syncGeoFromPixels(moved);
      return;
    }

    if (!drag && polyRef.current.closed) {
      setHoverEdge(hitTestEdge(polyRef.current.vertices, raw, true));
    }

    if (toolRef.current === "polygon") {
      if (!polyRef.current.closed && polyRef.current.vertices.length) {
        setPolyCursor(limitedPolyPoint(polyRef.current.vertices, point));
      }
      return;
    }

    if (!drag) return;
    if (drag.mode === "press") {
      const origin = drag.startRaw || drag.start;
      drag.maxDist = Math.max(
        drag.maxDist,
        Math.hypot(raw.x - origin.x, raw.y - origin.y)
      );
    }
    setDraft(limitedRect(drag.start, point));
  }, [areaLimit, limitedPolyPoint, limitedRect, syncGeoFromPixels]);

  const endPress = useCallback((e) => {
    const drag = dragRef.current;
    const el = canvasRef.current;
    if (!drag) return;
    if (el && e?.pointerId != null) {
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    }
    if (drag.mode === "edge") {
      dragRef.current = null;
      return;
    }
    if (toolRef.current !== "rectangle" || drag.mode !== "press") return;
    const raw = el ? pointFromEvent(el, e) : drag.startRaw || drag.start;
    const point = raw;
    const next = limitedRect(drag.start, point);
    if (drag.maxDist >= HOLD_DRAG_PX) {
      dragRef.current = null;
      setPlacing(false);
      setDraft(null);
      setRect(null);
      const done = commitRect(next);
      if (done) commitShape(rectToVertices(done));
      return;
    }
    dragRef.current = { start: drag.start, startRaw: drag.startRaw, startGeo: drag.startGeo, mode: "placing" };
    setPlacing(true);
    setDraft(next);
  }, [commitShape, limitedRect]);

  const onDoubleClick = useCallback(
    (e) => {
      if (toolRef.current !== "polygon") return;
      e.preventDefault();
      const { vertices, closed } = polyRef.current;
      if (closed || vertices.length < 2) return;
      const el = canvasRef.current;
      const cursor = el ? toPoint(el, e) : null;
      let pts = vertices;
      if (cursor && !pointsNear(cursor, vertices[vertices.length - 1])) {
        pts = [...vertices, limitedPolyPoint(vertices, cursor)];
      }
      closePolygon(pts);
    },
    [closePolygon, limitedPolyPoint, toPoint]
  );

  useEffect(() => {
    if (!placing || tool !== "rectangle") return undefined;
    const onMove = (e) => {
      const el = canvasRef.current;
      const drag = dragRef.current;
      if (!el || drag?.mode !== "placing") return;
      setDraft(limitedRect(drag.start, toPoint(el, e)));
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [limitedRect, placing, toPoint, tool]);

  useEffect(() => {
    if (tool !== "polygon" || polyClosed || !polyVertices.length) return undefined;
    const onMove = (e) => {
      const el = canvasRef.current;
      if (!el) return;
      setPolyCursor(limitedPolyPoint(polyRef.current.vertices, toPoint(el, e)));
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [limitedPolyPoint, polyClosed, polyVertices.length, toPoint, tool]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !showMap) return undefined;
    const onWheel = (e) => {
      const map = mapRef.current;
      if (!map || dragRef.current) return;
      e.preventDefault();
      const raw = pointFromEvent(el, e);
      const latlng = map.containerPointToLatLng(L.point(raw.x, raw.y));
      const step = e.deltaY > 0 ? -1 : 1;
      const nextZoom = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), map.getZoom() + step));
      if (nextZoom === map.getZoom()) return;
      map.setZoomAround(latlng, nextZoom, { animate: false });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [showMap]);

  useEffect(() => {
    const onKey = (e) => {
      if (design) return;
      const el = e.target;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) {
        return;
      }
      if (toolRef.current !== "polygon" || polyRef.current.closed) return;
      if (e.key === "Backspace" || e.key === "Delete") {
        if (!polyRef.current.vertices.length) return;
        e.preventDefault();
        undoPolygonNode();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelPolygonDraw();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancelPolygonDraw, design, undoPolygonNode]);

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

  const fetchEasementsForSite = useCallback(async (lat, lng, searchState, boundaryGeometry, parcelId) => {
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
      console.error("[QuickConcept] property-easements fetch failed:", err);
      setEasementsGeoJson(null);
    }
  }, []);

  const applyParcelFeature = useCallback((feature, pinPos) => {
    setParcelFeature(feature);
    const bounds = boundsFromGeoJsonFeature(feature);
    if (bounds) {
      setParcelBounds(bounds);
    } else {
      setParcelBounds(null);
    }
    if (!bounds && pinPos) setMapCenter(pinPos);
  }, []);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      setError("Enter an address to search.");
      return;
    }
    setLoading(true);
    setError(null);
    setParcelNotice("");
    setParcelFeature(null);
    setParcelBounds(null);
    setEasementsGeoJson(null);
    clearAll();
    try {
      const params = new URLSearchParams({
        q,
        format: "json",
        limit: "1",
        addressdetails: "1",
      });
      const res = await fetch(`${NOMINATIM_SEARCH}?${params.toString()}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error("Geocoding service returned an error. Try again in a moment.");
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        setMapCenter(null);
        setResultLabel("");
        setSearchKey("");
        setPpm(DEFAULT_PPM);
        ppmRef.current = DEFAULT_PPM;
        mapRef.current = null;
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
      const searchState = inferStateFromNominatimHit(hit);
      setMapCenter(pos);
      setResultLabel(label);
      setSearchKey(q);
      setBasemapId(basemapIdForPropertyState(searchState));
      addRecentMapSearch({ query: q, label });
      setLoading(false);

      const savedFeature = getSavedBoundaryForRecentQuery(q);
      if (savedFeature) {
        applyParcelFeature(savedFeature, pos);
        setParcelNotice("");
        void fetchEasementsForSite(
          lat,
          lon,
          searchState,
          savedFeature.geometry,
          savedFeature.properties?.parcel_pfi || savedFeature.properties?.parcelId || null
        );
        return;
      }

      const admin = await isUserAdmin();
      if (!admin) {
        setParcelNotice("Title boundary is only available for admin users.");
        return;
      }

      setParcelLoading(true);
      setParcelNotice("Looking up title boundary…");
      const parcelParams = parcelQueryParamsForPin(lat, lon, searchState, label);
      const boundaryController = new AbortController();
      const boundaryTimeout = setTimeout(() => boundaryController.abort(), 25000);
      let boundaryGeometry = null;
      let parcelIdForEasements = null;
      try {
        const parcelRes = await fetch(`/api/property-boundary?${parcelParams.toString()}`, {
          headers: getApiHeaders(),
          signal: boundaryController.signal,
        });
        const parcelData = await parcelRes.json().catch(() => ({}));
        const hasGeometry = parcelRes.ok && parcelData.ok && parcelData.geometry;
        if (hasGeometry) {
          const containsPin = parcelData.containsPin === true;
          const approximate = parcelData.approximate === true;
          if (!containsPin && !approximate) {
            setParcelFeature(null);
            setParcelBounds(null);
            setParcelNotice("Title boundary not available.");
          } else {
            const feature = {
              type: "Feature",
              geometry: parcelData.geometry,
              properties: {
                ...(parcelData.properties || {}),
                parcel_spi: parcelData.parcelSpi || null,
              },
            };
            boundaryGeometry = feature.geometry;
            parcelIdForEasements = parcelData.parcelId || parcelData.parcelPfi || null;
            applyParcelFeature(feature, pos);
            if (approximate && parcelData.warning) {
              const dist =
                parcelData.distanceToBoundaryMetres != null
                  ? ` (${parcelData.distanceToBoundaryMetres} m from pin)`
                  : "";
              setParcelNotice(`${parcelData.warning}${dist}`);
            } else {
              setParcelNotice("");
            }
          }
        } else {
          setParcelFeature(null);
          setParcelBounds(null);
          setParcelNotice(
            parcelData.timedOut || parcelRes.status === 504
              ? "Title boundary lookup timed out — try again. The map is still shown."
              : parcelData.error || "Title boundary not available."
          );
        }
      } catch (parcelErr) {
        const aborted = parcelErr?.name === "AbortError";
        console.error("[QuickConcept] property boundary fetch failed:", parcelErr);
        setParcelFeature(null);
        setParcelBounds(null);
        setParcelNotice(
          aborted
            ? "Title boundary lookup timed out — try again. The map is still shown."
            : "Title boundary not available."
        );
      } finally {
        clearTimeout(boundaryTimeout);
        setParcelLoading(false);
        window.setTimeout(() => {
          void fetchEasementsForSite(
            lat,
            lon,
            searchState,
            boundaryGeometry,
            parcelIdForEasements
          );
        }, boundaryGeometry ? 900 : 300);
      }
    } catch (e) {
      setMapCenter(null);
      setResultLabel("");
      setParcelFeature(null);
      setParcelBounds(null);
      setParcelNotice("");
      setSearchKey("");
      setPpm(DEFAULT_PPM);
      ppmRef.current = DEFAULT_PPM;
      mapRef.current = null;
      setError(e.message || "Search failed.");
    } finally {
      setLoading(false);
      setParcelLoading(false);
    }
  }, [applyParcelFeature, clearAll, fetchEasementsForSite, query]);

  const onViewReady = useCallback((map, nextPpm) => {
    mapRef.current = map;
    ppmRef.current = nextPpm;
    setPpm(nextPpm);
    const drag = dragRef.current;
    if (drag?.startGeo) {
      const p = latLngsToVerts(map, [drag.startGeo])[0];
      drag.start = p;
      drag.startRaw = p;
    }
    if (drag?.mode === "edge") return;
    const geo = geoPolyRef.current;
    if (geo.length >= 1) {
      const verts = latLngsToVerts(map, geo);
      setPolyVertices(verts);
      polyRef.current = { ...polyRef.current, vertices: verts };
    }
  }, []);

  const hint =
    tool === "polygon"
      ? snap
        ? "Click corners · each side snaps 90° to the last line · Backspace undoes · Esc cancels"
        : "Click to add corners · Backspace undoes the last point · Esc cancels"
      : "Click and drag, or click then move and click again · drag a side to edit";

  const hoverEdgePts =
    hoverEdge && polyVertices.length >= 2
      ? [polyVertices[hoverEdge.index], polyVertices[(hoverEdge.index + 1) % polyVertices.length]]
      : null;
  const canvasCursor = hoverEdgePts
    ? edgeAxis(hoverEdgePts[0], hoverEdgePts[1]) === "h"
      ? "ns-resize"
      : "ew-resize"
    : "crosshair";

  const shapeFill = showMap ? "rgba(255,255,255,0.22)" : "rgba(50, 50, 51, 0.08)";
  const shapeStroke = showMap ? WHITE : MONUMENT;
  const busy = loading || parcelLoading;

  return (
    <div
      className="page-container"
      style={{
        position: "fixed",
        inset: 0,
        background: LIGHT_MONUMENT,
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          margin: "24px auto 16px auto",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          padding: "0 32px",
          boxSizing: "border-box",
          flexShrink: 0,
        }}
      >
        <RouterLink to="/projects" style={{ position: "absolute", left: "40px", cursor: "pointer" }}>
          <img src={logo} alt="SGF Logo" style={{ width: "120px", height: "auto" }} />
        </RouterLink>
        <h1
          style={{
            margin: 0,
            fontSize: "2.4rem",
            fontWeight: 700,
            color: PAGE_TEXT,
            letterSpacing: "1px",
          }}
        >
          Quick Concept
        </h1>
      </div>

      <div
        className="sections-container"
        style={{
          display: "flex",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          margin: "0 auto 24px auto",
          gap: "32px",
          flex: 1,
          minHeight: 0,
        }}
      >
        <ToolsSidebarMenu fillHeight />

        <div
          className="content-section"
          style={{
            background: SECTION_GREY,
            borderRadius: "18px",
            flex: 1,
            minHeight: 0,
            height: "100%",
            boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
            padding: "16px",
            boxSizing: "border-box",
            overflow: "hidden",
            color: MONUMENT,
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void runSearch();
                }
              }}
              placeholder="123 Collins St, Melbourne VIC"
              disabled={busy}
              aria-label="Search address"
              style={{
                flex: 1,
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
              onClick={() => void runSearch()}
              disabled={busy}
              style={{
                ...toolbarButtonStyle(!busy),
                minWidth: "108px",
                background: busy ? UI.inputBg : WHITE,
              }}
            >
              {loading ? "Searching…" : parcelLoading ? "Loading…" : "Search"}
            </button>
          </div>
          {error || resultLabel || parcelNotice ? (
            <div
              style={{
                flexShrink: 0,
                fontSize: "0.82rem",
                lineHeight: 1.4,
                color: error ? "#b42318" : MONUMENT,
                opacity: error ? 1 : 0.8,
              }}
            >
              {error || parcelNotice || resultLabel}
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "8px",
              flexShrink: 0,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => selectTool("rectangle")}
                aria-pressed={tool === "rectangle"}
                style={snapToggleStyle(tool === "rectangle")}
              >
                Rectangle
              </button>
              <button
                type="button"
                onClick={() => selectTool("polygon")}
                aria-pressed={tool === "polygon"}
                style={snapToggleStyle(tool === "polygon")}
              >
                Polygon
              </button>
              <span style={{ fontSize: "0.9rem", color: MONUMENT, opacity: 0.75 }}>
                {hint}
              </span>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setMaxArea((on) => !on)}
                aria-pressed={maxArea}
                style={snapToggleStyle(maxArea)}
              >
                {maxArea ? "Max 60 m²" : "Any size"}
              </button>
              <button
                type="button"
                onClick={() => setSnap((on) => !on)}
                aria-pressed={snap}
                style={snapToggleStyle(snap)}
              >
                Snap
              </button>
              <button
                type="button"
                onClick={openDesign}
                disabled={!canDesign}
                style={toolbarButtonStyle(canDesign)}
              >
                Design
              </button>
              <button
                type="button"
                onClick={clearAll}
                disabled={!hasShape}
                style={toolbarButtonStyle(hasShape)}
              >
                Erase
              </button>
            </div>
          </div>

          <div
            style={{
              position: "relative",
              flex: 1,
              minHeight: 0,
              borderRadius: "12px",
              overflow: "hidden",
              backgroundColor: showMap ? "#1a1a1a" : WHITE,
            }}
          >
            {showMap ? (
              <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
                <MapContainer
                  center={mapCenter || DEFAULT_CENTER}
                  zoom={SEARCH_ZOOM}
                  maxZoom={MAP_MAX_ZOOM}
                  scrollWheelZoom={false}
                  dragging={false}
                  doubleClickZoom={false}
                  boxZoom={false}
                  keyboard={false}
                  touchZoom={false}
                  zoomControl={false}
                  attributionControl
                  style={{ height: "100%", width: "100%", pointerEvents: "none" }}
                >
                  <MapBasemapTileLayer basemapId={resolvedBasemapId} />
                  {parcelFeature ? (
                    <ParcelOutline key={`${searchKey}-boundary`} feature={parcelFeature} />
                  ) : null}
                  {easementsGeoJson ? (
                    <EasementsLayer
                      key={`${searchKey}-easements`}
                      easementsGeoJson={easementsGeoJson}
                      blockPointerEvents
                    />
                  ) : null}
                  <MapFitAndScale
                    bounds={parcelBounds}
                    center={mapCenter}
                    fitKey={searchKey}
                    onViewReady={onViewReady}
                  />
                  <MapViewSync onViewReady={onViewReady} />
                </MapContainer>
              </div>
            ) : null}

            <div
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endPress}
              onPointerCancel={endPress}
              onPointerLeave={() => {
                if (!dragRef.current) setHoverEdge(null);
              }}
              onDoubleClick={onDoubleClick}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 1,
                backgroundColor: showMap ? "transparent" : WHITE,
                cursor: busy ? "wait" : canvasCursor,
                pointerEvents: busy ? "none" : "auto",
                touchAction: "none",
                userSelect: "none",
              }}
            >
              {shownRect && shownRect.w >= MIN_SIZE_PX && shownRect.h >= MIN_SIZE_PX ? (
                <>
                  <div
                    style={{
                      position: "absolute",
                      left: shownRect.x,
                      top: shownRect.y,
                      width: shownRect.w,
                      height: shownRect.h,
                      boxSizing: "border-box",
                      border: `2px solid ${shapeStroke}`,
                      background: shapeFill,
                      pointerEvents: "none",
                    }}
                  />
                  <AreaLabel
                    x={shownRect.x + shownRect.w / 2}
                    y={shownRect.y + shownRect.h / 2}
                    areaM2={rectAreaM2}
                    compact={shownRect.w < 72 || shownRect.h < 36}
                  />
                  {rectSideLabels.map((side) => (
                    <LengthLabel key={side.key} x={side.x} y={side.y} text={side.label} />
                  ))}
                </>
              ) : null}

              {displayPoly.length >= 1 || (tool === "polygon" && polyVertices.length >= 1) ? (
                <>
                  <svg
                    width="100%"
                    height="100%"
                    style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
                  >
                    {!polyClosed &&
                      drawingGuides.map((line, i) => (
                        <line
                          key={`guide-${i}`}
                          x1={line.x1}
                          y1={line.y1}
                          x2={line.x2}
                          y2={line.y2}
                          stroke={line.origin ? "#FFD700" : shapeStroke}
                          strokeWidth={line.origin ? 1.25 : 1}
                          strokeDasharray={line.origin ? "7 5" : "5 6"}
                          opacity={line.origin ? 0.9 : 0.38}
                        />
                      ))}
                    {displayPoly.length >= 2 ? (
                      polyClosed ? (
                        <polygon
                          points={displayPoly.map((p) => `${p.x},${p.y}`).join(" ")}
                          fill={shapeFill}
                          stroke={shapeStroke}
                          strokeWidth="2"
                          strokeLinejoin="round"
                        />
                      ) : (
                        <polyline
                          points={displayPoly.map((p) => `${p.x},${p.y}`).join(" ")}
                          fill="none"
                          stroke={shapeStroke}
                          strokeWidth="2"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                      )
                    ) : null}
                    {hoverEdge && displayPoly.length >= 2 ? (
                      <line
                        x1={displayPoly[hoverEdge.index].x}
                        y1={displayPoly[hoverEdge.index].y}
                        x2={displayPoly[(hoverEdge.index + 1) % displayPoly.length].x}
                        y2={displayPoly[(hoverEdge.index + 1) % displayPoly.length].y}
                        stroke={shapeStroke}
                        strokeWidth="5"
                        strokeLinecap="round"
                        opacity="0.45"
                      />
                    ) : null}
                    {!polyClosed &&
                      polyVertices.map((p, i) => {
                        const hot = polyCursor && pointsNear(polyCursor, p);
                        return (
                          <circle
                            key={`${p.x}-${p.y}-${i}`}
                            cx={p.x}
                            cy={p.y}
                            r={hot ? 7 : i === 0 ? 5 : 3.5}
                            fill={i === 0 ? WHITE : hot ? "#FFD700" : MONUMENT}
                            stroke={i === 0 || hot ? "#FFD700" : MONUMENT}
                            strokeWidth="2"
                          />
                        );
                      })}
                  </svg>
                  {polyClosed && displayPoly.length >= 3 && polyAreaM2 > 0 ? (
                    <AreaLabel
                      x={polyCenter.x}
                      y={polyCenter.y}
                      areaM2={polyAreaM2}
                      compact={polyAreaM2 < 4}
                    />
                  ) : null}
                  {polySideLabels.map((side) => (
                    <LengthLabel key={side.key} x={side.x} y={side.y} text={side.label} />
                  ))}
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      {design ? (
        <DesignModal
          vertices={design.vertices}
          ppm={design.ppm}
          rooms={designRooms}
          onRoomsChange={setDesignRooms}
          nextIdRef={bedroomIdRef}
          onBuildingChange={applyDesignBuilding}
          maxAreaM2={maxArea ? MAX_AREA_M2 : 0}
          onClose={closeDesign}
        />
      ) : null}
    </div>
  );
}
