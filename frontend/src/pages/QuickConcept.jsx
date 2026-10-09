import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import L from "leaflet";
import { MapContainer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { jsPDF } from "jspdf";
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
import {
  benchAlongLoop,
  buildWallLoops,
  loopPointAt,
  nearestOnLoops,
  nearestParamOnLoop,
  snapLoopParam,
} from "../utils/kitchenCustomRun.js";
import QuickConcept3DPreview, { walkSplinePlanPoints } from "../components/QuickConcept3DPreview";
import sgfHomesLogo from "../images/SGF Homes.png";
import ModalBackdrop from "../components/ModalBackdrop";
import { useEmailSendOverlay } from "../components/EmailSendOverlay";

const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const EXPLORER_BORDER = "#d1d1d1";
const QUOTE_EMAIL_FROM = "info@superiorgrannyflats.com.au";

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

function quoteAddressState(quote) {
  const state = String(quote?.state || "").trim().toUpperCase();
  if (state === "VIC" || state === "QLD") return state;
  return "";
}

function quoteSearchAddress(quote) {
  const street = String(quote?.street || "").trim();
  const suburb = String(quote?.suburb || "").trim();
  const state = quoteAddressState(quote);
  if (!street && !suburb) return "";
  const locality = [suburb, state].filter(Boolean).join(" ");
  return [street, locality].filter(Boolean).join(", ");
}

function quoteListLabel(quote) {
  const street = String(quote?.street || "").trim();
  const suburb = String(quote?.suburb || "").trim();
  if (suburb && street) return `${suburb} - ${street}`;
  return suburb || street;
}

function quoteClientFirstName(quote) {
  const n = String(quote?.client_name || "").trim();
  if (!n) return "";
  return n.split(/\s+/)[0] || "";
}

function groupQuoteAddresses(quotes) {
  const groups = { VIC: [], QLD: [] };
  for (const quote of quotes || []) {
    const state = quoteAddressState(quote);
    if (!state) continue;
    const label = quoteListLabel(quote);
    if (!label) continue;
    groups[state].push({
      id: quote.id,
      label,
      search: quoteSearchAddress(quote) || label,
      email: String(quote?.email || "").trim(),
      firstName: quoteClientFirstName(quote),
    });
  }
  const byLabel = (a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" });
  groups.VIC.sort(byLabel);
  groups.QLD.sort(byLabel);
  return groups;
}

function quoteContactFromPick(quotePick, quoteGroups) {
  if (!quotePick) return { email: "", firstName: "" };
  const item = [...(quoteGroups?.VIC || []), ...(quoteGroups?.QLD || [])].find(
    (row) => String(row.id) === String(quotePick)
  );
  return {
    email: item?.email || "",
    firstName: item?.firstName || "",
  };
}

function projectSiteAddress(quotePick, quoteGroups, resultLabel, query) {
  if (quotePick) {
    const item = [...(quoteGroups?.VIC || []), ...(quoteGroups?.QLD || [])].find(
      (row) => String(row.id) === String(quotePick)
    );
    if (item?.search) return item.search;
    if (item?.label) return item.label;
  }
  const fromSearch = String(resultLabel || "").trim();
  if (fromSearch) return fromSearch;
  return String(query || "").trim();
}

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

function designExportBoundsPx(layout, rooms, pad = 8) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const p of layout?.pts || []) add(p.x, p.y);
  if (layout?.metres && layout?.eaveDepths) {
    for (const run of eaveRuns(layout.metres, layout.eaveDepths)) {
      const a = mPointToPx(run.a, layout);
      const b = mPointToPx(run.b, layout);
      add(a.x, a.y);
      add(b.x, b.y);
    }
  }
  for (const room of rooms || []) {
    const r = roomToPx(room, layout);
    add(r.x, r.y);
    add(r.x + r.w, r.y + r.h);
    if (roomKind(room) === "porch") {
      for (const step of porchStepFlight(room, layout.metres)) {
        const s = roomToPx(step, layout);
        add(s.x, s.y);
        add(s.x + s.w, s.y + s.h);
      }
    }
  }
  if (!Number.isFinite(minX)) return null;
  return {
    x: minX - pad,
    y: minY - pad,
    w: maxX - minX + pad * 2,
    h: maxY - minY + pad * 2,
  };
}

function tracePolygonPath(ctx, pts) {
  if (!pts?.length) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

function drawMetreGrid(ctx, box, ppm, offsetX, offsetY) {
  if (!(ppm > 0)) return;
  const left = box.x;
  const top = box.y;
  const right = box.x + box.w;
  const bottom = box.y + box.h;
  const mod = (v, m) => ((v % m) + m) % m;
  const firstX = left - mod(left - offsetX, ppm);
  const firstY = top - mod(top - offsetY, ppm);
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, box.w, box.h);
  ctx.clip();
  for (let x = firstX; x <= right + 0.5; x += ppm) {
    const strong = Math.abs((x - offsetX) / ppm) % 5 < 1e-6;
    ctx.beginPath();
    ctx.strokeStyle = strong ? "rgba(50, 50, 51, 0.22)" : "rgba(50, 50, 51, 0.08)";
    ctx.lineWidth = 1;
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
  }
  for (let y = firstY; y <= bottom + 0.5; y += ppm) {
    const strong = Math.abs((y - offsetY) / ppm) % 5 < 1e-6;
    ctx.beginPath();
    ctx.strokeStyle = strong ? "rgba(50, 50, 51, 0.22)" : "rgba(50, 50, 51, 0.08)";
    ctx.lineWidth = 1;
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHaloText(ctx, text, x, y, color, halo) {
  ctx.save();
  ctx.shadowColor = halo;
  ctx.shadowBlur = 6;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function uniqueSortedMetres(values, tol = 0.04) {
  const sorted = (values || []).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const out = [];
  for (const v of sorted) {
    if (!out.length || v - out[out.length - 1] > tol) out.push(v);
    else out[out.length - 1] = (out[out.length - 1] + v) / 2;
  }
  return out;
}

function drawCanvasRoundRect(ctx, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (rad <= 0.5) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function kitchenLayoutKind(room) {
  const v = String(room?.kitchenLayout || "")
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
  if (
    v === "cbar-right" ||
    v === "c-bar-right" ||
    v === "cshape-bar-right" ||
    v === "c-shape-bar-right" ||
    v === "wrap-c-right"
  ) {
    return "cbar-right";
  }
  if (
    v === "cbar-left" ||
    v === "c-bar-left" ||
    v === "cshape-bar-left" ||
    v === "c-shape-bar-left" ||
    v === "wrap-c-left"
  ) {
    return "cbar-left";
  }
  if (
    v === "cshape" ||
    v === "c-shape" ||
    v === "c" ||
    v === "ushape" ||
    v === "u-shape"
  ) {
    return "cshape";
  }
  if (
    v === "bar-right" ||
    v === "breakfast-right" ||
    v === "u-right" ||
    v === "wrap-right"
  ) {
    return "bar-right";
  }
  if (
    v === "bar-left" ||
    v === "breakfast-left" ||
    v === "u-left" ||
    v === "wrap-left" ||
    v === "bar" ||
    v === "breakfast"
  ) {
    return "bar-left";
  }
  if (v === "lshape-right" || v === "l-shape-right" || v === "l-right" || v === "lright") {
    return "lshape-right";
  }
  if (
    v === "lshape" ||
    v === "l-shape" ||
    v === "l" ||
    v === "lshape-left" ||
    v === "l-shape-left" ||
    v === "l-left" ||
    v === "lleft"
  ) {
    return "lshape-left";
  }
  if (v === "island") return "island";
  if (v === "custom") return "custom";
  return "galley";
}

function kitchenHasLeftReturn(kind) {
  return (
    kind === "lshape-left" ||
    kind === "bar-left" ||
    kind === "cshape" ||
    kind === "cbar-left" ||
    kind === "cbar-right"
  );
}

function kitchenHasRightReturn(kind) {
  return (
    kind === "lshape-right" ||
    kind === "bar-right" ||
    kind === "cshape" ||
    kind === "cbar-left" ||
    kind === "cbar-right"
  );
}

function kitchenHasWrap(kind) {
  return kind === "bar-left" || kind === "bar-right" || kind === "cbar-left" || kind === "cbar-right";
}

function kitchenWrapSide(kind) {
  return kind === "bar-right" || kind === "cbar-right" ? "right" : "left";
}

function roomLayoutLongIsX(room) {
  if (room?.layoutLongIsX === true) return true;
  if (room?.layoutLongIsX === false) return false;
  const { w, h } = unrotatedSize(room);
  return w >= h;
}

function withLayoutLongIsX(room) {
  if (room?.layoutLongIsX === true || room?.layoutLongIsX === false) return room;
  return { ...room, layoutLongIsX: roomLayoutLongIsX(room) };
}

function fitRoomToMinSize(room, inner) {
  const frozen = withLayoutLongIsX(room);
  const { minW, minH } = roomMinSize(frozen);
  let w = snapMetresToStep(Math.max(minW, frozen.w));
  let h = snapMetresToStep(Math.max(minH, frozen.h));
  if (w < minW) w = minW;
  if (h < minH) h = minH;
  let x = frozen.x;
  let y = frozen.y;
  if (inner?.length) {
    const b = buildingBounds(inner);
    if (x + w > b.maxX) x = b.maxX - w;
    if (y + h > b.maxY) y = b.maxY - h;
    if (x < b.minX) x = b.minX;
    if (y < b.minY) y = b.minY;
  }
  return { ...frozen, x, y, w, h };
}

function cycleKitchenLayout(room, inner) {
  const order = KITCHEN_LAYOUTS;
  const i = Math.max(0, order.indexOf(kitchenLayoutKind(room)));
  const {
    kitchenRun0: _r0,
    kitchenRun1: _r1,
    cookBench: _cb,
    cookAlong: _ca,
    sinkBench: _sb,
    sinkAlong: _sa,
    pantryBench: _pb,
    pantryAlong: _pa,
    fridgeBench: _fb,
    fridgeAlong: _fa,
    kitchenCustomBench: _bench,
    ...rest
  } = room;
  // A drawn custom bench steps back to "custom, ready to draw" before leaving custom.
  const nextKind = hasCustomBench(room) ? "custom" : order[(i + 1) % order.length];
  return fitRoomToMinSize({ ...rest, kitchenLayout: nextKind }, inner);
}

function isCustomKitchen(room) {
  return roomKind(room) === "kitchen" && kitchenLayoutKind(room) === "custom";
}

const BENCH_WALL_HIT_PX = 14;

/**
 * While a custom kitchen is waiting for its bench, the wall face under the cursor
 * (unless a room's corner icon is there). Returns { room, loop, s } or null.
 */
function armedBenchWallAt(raw, layout, innerMetres, rooms) {
  if (!layout || !innerMetres) return null;
  const room = (rooms || []).find(isArmedCustomKitchen);
  if (!room) return null;
  const hs = handlePx(layout);
  const onIcon = (rooms || []).some((r) => {
    const px = roomToPx(r, layout);
    return (
      hitRoomHandle(px, raw, hs) ||
      (roomKind(r) === "kitchen" && hitKitchenLayoutHandle(px, raw, hs)) ||
      hitCouchOptions(r, layout, raw)
    );
  });
  if (onIcon) return null;
  const loops = designWallLoops(innerMetres, rooms);
  const hit = nearestOnLoops(loops, pxToMetres(raw, layout));
  if (!hit || hit.dist * layout.scale > BENCH_WALL_HIT_PX) return null;
  const loop = loops[hit.loopIndex];
  return { room, loop, s: snapLoopParam(loop, hit.s) };
}

function hasCustomBench(room) {
  return isCustomKitchen(room) && Boolean(room?.kitchenCustomBench?.segs?.length);
}

/** A custom kitchen still waiting for its bench to be drawn on a wall. */
function isArmedCustomKitchen(room) {
  return isCustomKitchen(room) && !hasCustomBench(room);
}

/** Wall faces around the open-plan area (external walls + bedroom/bathroom walls). */
function designWallLoops(innerMetres, rooms) {
  const t = WALL_THICKNESS_M;
  const blocks = (rooms || [])
    .filter(roomNeedsPartitionWalls)
    .map((r) => ({ x: r.x - t, y: r.y - t, w: r.w + t * 2, h: r.h + t * 2 }));
  return buildWallLoops(innerMetres, blocks);
}

/** Turn a drawn bench (world metres) into the kitchen room: its box becomes the room. */
function finalizeCustomBench(room, bench) {
  const xs = bench.poly.map((p) => p.x);
  const ys = bench.poly.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const w = Math.max(...xs) - x;
  const h = Math.max(...ys) - y;
  const segs = bench.segs.map((s) => ({
    ...s,
    rect: { x: s.rect.x - x, y: s.rect.y - y, w: s.rect.w, h: s.rect.h },
    t0: s.t0 - (s.alongX ? x : y),
    t1: s.t1 - (s.alongX ? x : y),
  }));
  const poly = bench.poly.map((p) => ({ x: p.x - x, y: p.y - y }));
  return placeCustomKitchenAppliances({
    ...stripKitchenAppliances(room),
    x,
    y,
    w,
    h,
    rot: 0,
    layoutLongIsX: w >= h,
    kitchenCustomBench: { segs, poly },
  });
}

function stripKitchenAppliances(room) {
  const {
    cookBench: _cb,
    cookAlong: _ca,
    sinkBench: _sb,
    sinkAlong: _sa,
    pantryBench: _pb,
    pantryAlong: _pa,
    fridgeBench: _fb,
    fridgeAlong: _fa,
    ...rest
  } = room;
  return rest;
}

/** Custom-kitchen bench pieces (unrotated local), in the order they were drawn along the walls. */
function customKitchenSegments(room) {
  return hasCustomBench(room) ? room.kitchenCustomBench.segs : [];
}

/**
 * Fridge, pantry, cooktop then sink laid out in drawing order along a finished custom run,
 * moving to the next wall when an item won't fit on the current one.
 */
function placeCustomKitchenAppliances(room) {
  const benches = kitchenWorkBenches(room);
  let next = stripKitchenAppliances(room);
  if (!benches.length) return next;
  const items = [
    { type: "fridge", size: FRIDGE_ALONG_M, gap: 0 },
    { type: "pantry", size: PANTRY_M, gap: 0 },
    { type: "cook", size: COOKTOP_M, gap: 0.3 },
    { type: "sink", size: SINK_ALONG_M, gap: 0.6 },
  ];
  let bi = 0;
  let used = 0;
  for (const it of items) {
    let placed = false;
    while (bi < benches.length) {
      const b = benches[bi];
      const len = b.t1 - b.t0;
      const gap = used > 0 ? it.gap : 0;
      if (used + gap + it.size <= len + 1e-6) {
        const off = used + gap;
        const along = b.dir > 0 ? b.t0 + off : b.t1 - off - it.size;
        next = applyKitchenApplianceAlong(next, it.type, along, b.id);
        used = off + it.size;
        placed = true;
        break;
      }
      bi += 1;
      used = 0;
    }
    if (!placed) {
      const b = benches.reduce((best, x) => (x.t1 - x.t0 > best.t1 - best.t0 ? x : best), benches[0]);
      const along = Math.max(b.t0, Math.min(b.t1 - it.size, (b.t0 + b.t1 - it.size) / 2));
      next = applyKitchenApplianceAlong(next, it.type, along, b.id);
    }
  }
  return next;
}

function rectPolygon(rect) {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
  ];
}

function kitchenLPolygon(w, h, depth, side, longIsX) {
  if (longIsX) {
    if (side === "left") {
      return [
        { x: 0, y: 0 },
        { x: depth, y: 0 },
        { x: depth, y: h - depth },
        { x: w, y: h - depth },
        { x: w, y: h },
        { x: 0, y: h },
      ];
    }
    return [
      { x: w - depth, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
      { x: 0, y: h - depth },
      { x: w - depth, y: h - depth },
    ];
  }
  if (side === "left") {
    return [
      { x: 0, y: 0 },
      { x: depth, y: 0 },
      { x: depth, y: h - depth },
      { x: w, y: h - depth },
      { x: w, y: h },
      { x: 0, y: h },
    ];
  }
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: depth },
    { x: depth, y: depth },
    { x: depth, y: h },
    { x: 0, y: h },
  ];
}

function kitchenCPolygon(w, h, depth, longIsX) {
  if (longIsX) {
    return [
      { x: 0, y: 0 },
      { x: depth, y: 0 },
      { x: depth, y: h - depth },
      { x: w - depth, y: h - depth },
      { x: w - depth, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ];
  }
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: depth },
    { x: depth, y: depth },
    { x: depth, y: h - depth },
    { x: w, y: h - depth },
    { x: w, y: h },
    { x: 0, y: h },
  ];
}

function kitchenCBarShape(w, h, depth, barDepth, longIsX, side, t0, t1) {
  if (longIsX) {
    const li = depth;
    const ri = w - depth;
    const mi = h - depth;
    const meetsL = t0 <= li + 1e-9;
    const meetsR = t1 >= ri - 1e-9;
    if (meetsL && meetsR) {
      return {
        poly: [
          { x: 0, y: 0 },
          { x: w, y: 0 },
          { x: w, y: h },
          { x: 0, y: h },
        ],
        hole: [
          { x: li, y: barDepth },
          { x: ri, y: barDepth },
          { x: ri, y: mi },
          { x: li, y: mi },
        ],
      };
    }
    if (side === "left" || meetsL) {
      return {
        poly: [
          { x: 0, y: 0 },
          { x: t1, y: 0 },
          { x: t1, y: barDepth },
          { x: li, y: barDepth },
          { x: li, y: mi },
          { x: ri, y: mi },
          { x: ri, y: 0 },
          { x: w, y: 0 },
          { x: w, y: h },
          { x: 0, y: h },
        ],
      };
    }
    return {
      poly: [
        { x: 0, y: 0 },
        { x: li, y: 0 },
        { x: li, y: mi },
        { x: ri, y: mi },
        { x: ri, y: barDepth },
        { x: t0, y: barDepth },
        { x: t0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ],
    };
  }
  const ti = depth;
  const bi = h - depth;
  const mi = depth;
  const barX = w - barDepth;
  const meetsT = t0 <= ti + 1e-9;
  const meetsB = t1 >= bi - 1e-9;
  if (meetsT && meetsB) {
    return {
      poly: [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ],
      hole: [
        { x: mi, y: ti },
        { x: barX, y: ti },
        { x: barX, y: bi },
        { x: mi, y: bi },
      ],
    };
  }
  if (side === "right" || meetsT) {
    return {
      poly: [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: t1 },
        { x: barX, y: t1 },
        { x: barX, y: ti },
        { x: mi, y: ti },
        { x: mi, y: bi },
        { x: w, y: bi },
        { x: w, y: h },
        { x: 0, y: h },
      ],
    };
  }
  return {
    poly: [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: ti },
      { x: mi, y: ti },
      { x: mi, y: bi },
      { x: barX, y: bi },
      { x: barX, y: t0 },
      { x: w, y: t0 },
      { x: w, y: h },
      { x: 0, y: h },
    ],
  };
}

function kitchenAlongLen(w, h, longIsX) {
  return longIsX ? w : h;
}

function wrapRunFromStart(kind, longIsX) {
  const side = kitchenWrapSide(kind);
  return (longIsX && side === "left") || (!longIsX && side === "right");
}

function defaultKitchenRun(along, kind, side, longIsX) {
  const min = 0.9;
  const half = Math.max(min, along * 0.5);
  if (kind === "island") {
    const t0 = Math.max(0, (along - half) / 2);
    return { t0, t1: Math.min(along, t0 + half) };
  }
  if (wrapRunFromStart(kind, longIsX)) return { t0: 0, t1: Math.min(along, half) };
  return { t0: Math.max(0, along - half), t1: along };
}

function kitchenRunRange(room, w, h, longIsX, kind, side) {
  const along = kitchenAlongLen(w, h, longIsX);
  const min = 0.9;
  const stored0 = Number(room?.kitchenRun0);
  const stored1 = Number(room?.kitchenRun1);
  let t0;
  let t1;
  if (Number.isFinite(stored0) && Number.isFinite(stored1) && stored1 - stored0 >= min - 1e-6) {
    t0 = stored0;
    t1 = stored1;
  } else {
    const d = defaultKitchenRun(along, kind, side, longIsX);
    t0 = d.t0;
    t1 = d.t1;
  }
  t0 = Math.max(0, Math.min(t0, along - min));
  t1 = Math.max(t0 + min, Math.min(along, t1));
  if (kitchenHasWrap(kind)) {
    if (wrapRunFromStart(kind, longIsX)) {
      t0 = 0;
      t1 = Math.max(t0 + min, Math.min(along, t1));
    } else {
      t1 = along;
      t0 = Math.max(0, Math.min(t0, t1 - min));
    }
  }
  return { t0, t1, along };
}

function kitchenRunHandleLocals(w, h, barDepth, longIsX, run, ends = ["t0", "t1"]) {
  const all = longIsX
    ? [
        { which: "t0", x: run.t0, y: barDepth / 2 },
        { which: "t1", x: run.t1, y: barDepth / 2 },
      ]
    : [
        { which: "t0", x: w - barDepth / 2, y: run.t0 },
        { which: "t1", x: w - barDepth / 2, y: run.t1 },
      ];
  return all.filter((h) => ends.includes(h.which));
}

function kitchenRunResizeKind(room) {
  const localIsX = roomLayoutLongIsX(room);
  const rot = roomRotation(room);
  const worldIsX = rot === 90 || rot === 270 ? !localIsX : localIsX;
  return worldIsX ? "ew" : "ns";
}

function kitchenBarLayout(w, h, depth, barDepth, side, longIsX, run) {
  const t0 = run.t0;
  const t1 = run.t1;
  const dashFromInner = barDepth - depth;
  if (longIsX) {
    const joinedLeft = t0 <= 1e-6;
    const joinedRight = t1 >= w - 1e-6;
    if (side === "left") {
      const bar = { x: t0, y: 0, w: t1 - t0, h: barDepth };
      const locals = [
        { x: 0, y: h - depth, w, h: depth },
        { x: 0, y: 0, w: depth, h: Math.max(0, h - depth) },
        bar,
      ];
      const poly = joinedLeft
        ? [
            { x: 0, y: 0 },
            { x: t1, y: 0 },
            { x: t1, y: barDepth },
            { x: depth, y: barDepth },
            { x: depth, y: h - depth },
            { x: w, y: h - depth },
            { x: w, y: h },
            { x: 0, y: h },
          ]
        : kitchenLPolygon(w, h, depth, "left", true);
      return {
        locals,
        poly,
        extraPolys: joinedLeft ? [] : [rectPolygon(bar)],
        dashes: [
          [
            { x: t0, y: dashFromInner },
            { x: t1, y: dashFromInner },
          ],
        ],
      };
    }
    const bar = { x: t0, y: 0, w: t1 - t0, h: barDepth };
    const locals = [
      { x: 0, y: h - depth, w, h: depth },
      { x: w - depth, y: 0, w: depth, h: Math.max(0, h - depth) },
      bar,
    ];
    const poly = joinedRight
      ? [
          { x: t0, y: 0 },
          { x: w, y: 0 },
          { x: w, y: h },
          { x: 0, y: h },
          { x: 0, y: h - depth },
          { x: w - depth, y: h - depth },
          { x: w - depth, y: barDepth },
          { x: t0, y: barDepth },
        ]
      : kitchenLPolygon(w, h, depth, "right", true);
    return {
      locals,
      poly,
      extraPolys: joinedRight ? [] : [rectPolygon(bar)],
      dashes: [
        [
          { x: t0, y: dashFromInner },
          { x: t1, y: dashFromInner },
        ],
      ],
    };
  }
  const dashX = w - barDepth + depth;
  const joinedTop = t0 <= 1e-6;
  const joinedBottom = t1 >= h - 1e-6;
  if (side === "left") {
    const bar = { x: w - barDepth, y: t0, w: barDepth, h: t1 - t0 };
    const locals = [
      { x: 0, y: 0, w: depth, h },
      { x: depth, y: h - depth, w: Math.max(0, w - depth), h: depth },
      bar,
    ];
    const poly = joinedBottom
      ? [
          { x: 0, y: 0 },
          { x: depth, y: 0 },
          { x: depth, y: h - depth },
          { x: w - barDepth, y: h - depth },
          { x: w - barDepth, y: t0 },
          { x: w, y: t0 },
          { x: w, y: h },
          { x: 0, y: h },
        ]
      : kitchenLPolygon(w, h, depth, "left", false);
    return {
      locals,
      poly,
      extraPolys: joinedBottom ? [] : [rectPolygon(bar)],
      dashes: [
        [
          { x: dashX, y: t0 },
          { x: dashX, y: t1 },
        ],
      ],
    };
  }
  const bar = { x: w - barDepth, y: t0, w: barDepth, h: t1 - t0 };
  const locals = [
    { x: 0, y: 0, w: depth, h },
    { x: depth, y: 0, w: Math.max(0, w - depth), h: depth },
    bar,
  ];
  const poly = joinedTop
    ? [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: t1 },
        { x: w - barDepth, y: t1 },
        { x: w - barDepth, y: depth },
        { x: depth, y: depth },
        { x: depth, y: h },
        { x: 0, y: h },
      ]
    : kitchenLPolygon(w, h, depth, "right", false);
  return {
    locals,
    poly,
    extraPolys: joinedTop ? [] : [rectPolygon(bar)],
    dashes: [
      [
        { x: dashX, y: t0 },
        { x: dashX, y: t1 },
      ],
    ],
  };
}

function kitchenWorkBenches(room) {
  const { w, h } = unrotatedSize(room);
  const depth = KITCHEN_BENCH_M;
  const barDepth = KITCHEN_BAR_M;
  const longIsX = roomLayoutLongIsX(room);
  const kind = kitchenLayoutKind(room);
  if (kind === "custom") {
    return customKitchenSegments(room).map((s, i) => ({
      id: `c${i}`,
      group: "run",
      ...s.rect,
      alongX: s.alongX,
      wall: s.wall,
      dir: s.dir,
      t0: s.t0,
      t1: s.t1,
    }));
  }
  const benches = [];
  if (longIsX) {
    benches.push({
      id: "main",
      group: "run",
      x: 0,
      y: h - depth,
      w,
      h: depth,
      alongX: true,
      wall: "maxY",
      t0: 0,
      t1: w,
    });
  } else {
    benches.push({
      id: "main",
      group: "run",
      x: 0,
      y: 0,
      w: depth,
      h,
      alongX: false,
      wall: "minX",
      t0: 0,
      t1: h,
    });
  }
  const hasLeft = kitchenHasLeftReturn(kind);
  const hasRight = kitchenHasRightReturn(kind);
  if (hasLeft) {
    if (longIsX) {
      benches.push({
        id: hasRight ? "return-left" : "return",
        group: "run",
        x: 0,
        y: 0,
        w: depth,
        h: Math.max(0.2, h - depth),
        alongX: false,
        wall: "minX",
        t0: 0,
        t1: Math.max(0.2, h - depth),
      });
    } else {
      benches.push({
        id: hasRight ? "return-left" : "return",
        group: "run",
        x: depth,
        y: h - depth,
        w: Math.max(0.2, w - depth),
        h: depth,
        alongX: true,
        wall: "maxY",
        t0: depth,
        t1: w,
      });
    }
  }
  if (hasRight) {
    if (longIsX) {
      benches.push({
        id: hasLeft ? "return-right" : "return",
        group: "run",
        x: w - depth,
        y: 0,
        w: depth,
        h: Math.max(0.2, h - depth),
        alongX: false,
        wall: "maxX",
        t0: 0,
        t1: Math.max(0.2, h - depth),
      });
    } else {
      benches.push({
        id: hasLeft ? "return-right" : "return",
        group: "run",
        x: depth,
        y: 0,
        w: Math.max(0.2, w - depth),
        h: depth,
        alongX: true,
        wall: "minY",
        t0: depth,
        t1: w,
      });
    }
  }
  const barFits = longIsX
    ? h >= depth + barDepth + KITCHEN_CLEAR_M
    : w >= depth + barDepth + KITCHEN_CLEAR_M;
  if (kitchenHasWrap(kind) && barFits) {
    const side = kitchenWrapSide(kind);
    const run = kitchenRunRange(room, w, h, longIsX, kind, side);
    if (longIsX) {
      benches.push({
        id: "bar",
        group: "bar",
        x: run.t0,
        y: 0,
        w: Math.max(0.01, run.t1 - run.t0),
        h: barDepth,
        alongX: true,
        wall: "minY",
        t0: run.t0,
        t1: run.t1,
      });
    } else {
      benches.push({
        id: "bar",
        group: "bar",
        x: w - barDepth,
        y: run.t0,
        w: barDepth,
        h: Math.max(0.01, run.t1 - run.t0),
        alongX: false,
        wall: "maxX",
        t0: run.t0,
        t1: run.t1,
      });
    }
  }
  if (kind === "island") {
    const run = kitchenRunRange(room, w, h, longIsX, kind, "left");
    if (longIsX) {
      const gap = h - depth - barDepth;
      if (gap + 0.02 >= KITCHEN_CLEAR_M) {
        benches.push({
          id: "island",
          group: "island",
          x: run.t0,
          y: 0,
          w: Math.max(0.01, run.t1 - run.t0),
          h: barDepth,
          alongX: true,
          wall: "minY",
          t0: run.t0,
          t1: run.t1,
        });
      }
    } else {
      const gap = w - depth - barDepth;
      if (gap + 0.02 >= KITCHEN_CLEAR_M) {
        benches.push({
          id: "island",
          group: "island",
          x: w - barDepth,
          y: run.t0,
          w: barDepth,
          h: Math.max(0.01, run.t1 - run.t0),
          alongX: false,
          wall: "maxX",
          t0: run.t0,
          t1: run.t1,
        });
      }
    }
  }
  return benches;
}

function benchAlongAt(bench, x, y) {
  return bench.alongX ? x : y;
}

function localPointInRect(p, r, pad = 0) {
  return p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
}

function distToRect(p, r) {
  const dx = p.x < r.x ? r.x - p.x : p.x > r.x + r.w ? p.x - (r.x + r.w) : 0;
  const dy = p.y < r.y ? r.y - p.y : p.y > r.y + r.h ? p.y - (r.y + r.h) : 0;
  return Math.hypot(dx, dy);
}

function insetInRect(p, r) {
  if (!localPointInRect(p, r)) return -1;
  return Math.min(p.x - r.x, r.x + r.w - p.x, p.y - r.y, r.y + r.h - p.y);
}

function applianceLocalOnBench(bench, along, size, hang = false) {
  const t0 = hang ? along : Math.max(bench.t0, Math.min(bench.t1 - size, along));
  const pad = (KITCHEN_BENCH_M - size) / 2;
  if (bench.alongX && bench.wall === "maxY") {
    return { x: t0, y: bench.y + bench.h - pad - size, w: size, h: size };
  }
  if (bench.alongX && bench.wall === "minY") {
    return { x: t0, y: bench.y + pad, w: size, h: size };
  }
  if (bench.wall === "minX") {
    return { x: bench.x + pad, y: t0, w: size, h: size };
  }
  return { x: bench.x + bench.w - pad - size, y: t0, w: size, h: size };
}

function cookLocalOnBench(bench, along) {
  return applianceLocalOnBench(bench, along, COOKTOP_M);
}

function pantryLocalOnBench(bench, along) {
  return applianceLocalOnBench(bench, along, PANTRY_M, true);
}

function fridgeLocalOnBench(bench, along) {
  const a = FRIDGE_ALONG_M;
  const d = FRIDGE_ACROSS_M;
  const work = KITCHEN_BENCH_M;
  const extra = d - work;
  const t0 = along;
  if (bench.alongX && bench.wall === "maxY") {
    return { x: t0, y: bench.y - extra, w: a, h: d };
  }
  if (bench.alongX && bench.wall === "minY") {
    return { x: t0, y: bench.y + bench.h - work, w: a, h: d };
  }
  if (bench.wall === "minX") {
    return { x: bench.x + bench.w - work, y: t0, w: d, h: a };
  }
  return { x: bench.x - extra, y: t0, w: d, h: a };
}

function hangAlongLimits(bench, room, size) {
  const { w, h } = unrotatedSize(room);
  const roomMin = 0;
  const roomMax = (bench.alongX ? w : h) - size;
  const hangStart = bench.t0 - size;
  const hangEnd = bench.t1;
  const onMin = bench.t0;
  const onMax = bench.t1 - size;
  return {
    min: Math.max(hangStart, roomMin),
    max: Math.min(hangEnd, roomMax),
    onMin,
    onMax,
    hangStart,
    hangEnd,
    canHangStart: hangStart >= roomMin - 1e-9,
    canHangEnd: hangEnd <= roomMax + 1e-9,
  };
}

function snapHangAlong(bench, along, room, size) {
  const lim = hangAlongLimits(bench, room, size);
  let t = snapPlanMm(along);
  t = Math.max(lim.min, Math.min(lim.max, t));
  if (lim.canHangStart && t < lim.onMin) return snapPlanMm(Math.max(lim.min, lim.hangStart));
  if (lim.canHangEnd && t > lim.onMax) return snapPlanMm(Math.min(lim.max, lim.hangEnd));
  return snapPlanMm(Math.max(lim.onMin, Math.min(lim.onMax, t)));
}

function pantryAlongLimits(bench, room) {
  return hangAlongLimits(bench, room, PANTRY_M);
}

function snapPantryAlong(bench, along, room) {
  return snapHangAlong(bench, along, room, PANTRY_M);
}

function snapFridgeAlong(bench, along, room) {
  return snapHangAlong(bench, along, room, FRIDGE_ALONG_M);
}

function sinkFrameOnBench(bench, along) {
  const t0 = Math.max(bench.t0, Math.min(bench.t1 - SINK_ALONG_M, along));
  const inset = (KITCHEN_BENCH_M - SINK_ACROSS_M) / 2;
  if (bench.alongX && bench.wall === "maxY") {
    const front = bench.y + inset;
    const t = Math.max(bench.t0, Math.min(bench.t1 - SINK_ALONG_M, t0 + SINK_RIGHT_M));
    return {
      origin: { x: t, y: front },
      along: { x: SINK_ALONG_M, y: 0 },
      across: { x: 0, y: SINK_ACROSS_M },
    };
  }
  if (bench.alongX && bench.wall === "minY") {
    const front = bench.y + bench.h - inset;
    const t = Math.max(bench.t0, Math.min(bench.t1 - SINK_ALONG_M, t0 + SINK_RIGHT_M));
    return {
      origin: { x: t, y: front },
      along: { x: SINK_ALONG_M, y: 0 },
      across: { x: 0, y: -SINK_ACROSS_M },
    };
  }
  if (bench.wall === "minX") {
    const front = bench.x + bench.w - inset;
    const t = Math.max(bench.t0, Math.min(bench.t1 - SINK_ALONG_M, t0 + SINK_RIGHT_M));
    return {
      origin: { x: front, y: t },
      along: { x: 0, y: SINK_ALONG_M },
      across: { x: -SINK_ACROSS_M, y: 0 },
    };
  }
  const front = bench.x + inset;
  const t = Math.max(bench.t0, Math.min(bench.t1 - SINK_ALONG_M, t0 + SINK_RIGHT_M));
  return {
    origin: { x: front, y: t },
    along: { x: 0, y: SINK_ALONG_M },
    across: { x: SINK_ACROSS_M, y: 0 },
  };
}

function sinkRectOnBench(bench, along) {
  const f = sinkFrameOnBench(bench, along);
  const xs = [f.origin.x, f.origin.x + f.along.x, f.origin.x + f.across.x, f.origin.x + f.along.x + f.across.x];
  const ys = [f.origin.y, f.origin.y + f.along.y, f.origin.y + f.across.y, f.origin.y + f.along.y + f.across.y];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function kitchenApplianceMeta(type) {
  if (type === "cook") return { benchKey: "cookBench", alongKey: "cookAlong", size: COOKTOP_M };
  if (type === "pantry") return { benchKey: "pantryBench", alongKey: "pantryAlong", size: PANTRY_M };
  if (type === "fridge") return { benchKey: "fridgeBench", alongKey: "fridgeAlong", size: FRIDGE_ALONG_M };
  return { benchKey: "sinkBench", alongKey: "sinkAlong", size: SINK_ALONG_M };
}

function kitchenHangType(type) {
  return type === "pantry" || type === "fridge";
}

function resolveKitchenAppliance(room, type) {
  const benches = kitchenWorkBenches(room);
  if (!benches.length) return null;
  const { benchKey, alongKey, size } = kitchenApplianceMeta(type);
  let bench = benches.find((b) => b.id === room[benchKey]);
  if (!bench) bench = benches.find((b) => b.id === "main") || benches[0];
  let along = Number(room[alongKey]);
  if (!Number.isFinite(along)) {
    if (type === "cook") {
      along = Math.max(bench.t0, Math.min(bench.t1 - size, bench.t0 + 0.2));
    } else if (type === "pantry") {
      along = snapPantryAlong(bench, bench.t1, room);
    } else if (type === "fridge") {
      along = snapFridgeAlong(bench, bench.t0, room);
    } else {
      const cook = resolveKitchenAppliance(room, "cook");
      const after =
        cook && cook.bench.id === bench.id ? cook.along + COOKTOP_M + 0.12 : bench.t0 + 0.2;
      along = Math.max(bench.t0, Math.min(bench.t1 - size, after));
    }
  } else if (kitchenHangType(type)) {
    along = snapHangAlong(bench, along, room, size);
  } else {
    along = Math.max(bench.t0, Math.min(Math.max(bench.t0, bench.t1 - size), along));
  }
  return { bench, along, size };
}

function kitchenApplianceSpansOn(room, benchId) {
  const spans = [];
  for (const type of ["cook", "sink", "pantry", "fridge"]) {
    const placed = resolveKitchenAppliance(room, type);
    if (!placed || placed.bench.id !== benchId) continue;
    if (kitchenHangType(type)) {
      const t0 = Math.max(placed.along, placed.bench.t0);
      const t1 = Math.min(placed.along + placed.size, placed.bench.t1);
      if (t1 - t0 < 0.05) continue;
      spans.push({ t0, t1 });
      continue;
    }
    spans.push({ t0: placed.along, t1: placed.along + placed.size });
  }
  return spans;
}

function applianceIsHanging(placed) {
  if (!placed?.bench) return false;
  const { along, size, bench } = placed;
  return along < bench.t0 - 0.02 || along > bench.t1 - size + 0.02;
}

function pantryIsHanging(placed) {
  return applianceIsHanging(placed);
}

function kitchenAppliancesOnBench(room, bench) {
  const items = [];
  for (const type of ["cook", "sink", "pantry", "fridge"]) {
    const placed = resolveKitchenAppliance(room, type);
    if (!placed || placed.bench.id !== bench.id) continue;
    items.push({ type, along: placed.along, size: placed.size });
  }
  items.sort((a, b) => a.along - b.along);
  return items;
}

function kitchenPackedLenOnBench(room, bench) {
  return kitchenAppliancesOnBench(room, bench).reduce((sum, it) => {
    if (kitchenHangType(it.type) && applianceIsHanging({ ...it, bench })) return sum;
    return sum + it.size;
  }, 0);
}

function applyKitchenApplianceAlong(room, type, along, benchId) {
  const { benchKey, alongKey } = kitchenApplianceMeta(type);
  return { ...room, [benchKey]: benchId, [alongKey]: snapPlanMm(along) };
}

function compactKitchenAppliances(room) {
  if (roomKind(room) !== "kitchen") return room;
  const benches = kitchenWorkBenches(room);
  let next = room;
  for (const bench of benches) {
    const items = kitchenAppliancesOnBench(next, bench);
    if (!items.length) continue;
    const hanging = [];
    const on = [];
    for (const it of items) {
      if (kitchenHangType(it.type) && applianceIsHanging({ ...it, bench })) hanging.push(it);
      else on.push(it);
    }
    let limit = bench.t1;
    for (let i = on.length - 1; i >= 0; i -= 1) {
      const it = on[i];
      const minAlong = bench.t0 + on.slice(0, i).reduce((s, x) => s + x.size, 0);
      it.along = Math.min(it.along, limit - it.size);
      it.along = Math.max(it.along, minAlong);
      limit = it.along;
    }
    let cursor = bench.t0;
    for (const it of on) {
      if (it.along < cursor) it.along = cursor;
      cursor = it.along + it.size;
    }
    if (on.length) {
      const last = on[on.length - 1];
      if (last.along + last.size > bench.t1 + 1e-9) {
        let packed = bench.t0;
        for (const it of on) {
          it.along = packed;
          packed += it.size;
        }
      }
    }
    for (const it of on) {
      next = applyKitchenApplianceAlong(next, it.type, it.along, bench.id);
    }
    for (const it of hanging) {
      const hangEnd = it.along + it.size / 2 >= (bench.t0 + bench.t1) / 2;
      const along = hangEnd ? bench.t1 : bench.t0 - it.size;
      next = applyKitchenApplianceAlong(next, it.type, along, bench.id);
    }
  }
  return next;
}

function nearestBenchInGroup(benches, group, local) {
  let best = null;
  let bestD = Infinity;
  for (const b of benches) {
    if (b.group !== group) continue;
    const d = distToRect(local, b);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

function moveKitchenAppliance(room, type, cursorM, grabAlong) {
  const benches = kitchenWorkBenches(room);
  const placed = resolveKitchenAppliance(room, type);
  if (!placed || !benches.length) return room;
  const local = worldToUnrotatedLocal(room, cursorM);
  const last = placed.bench;
  let next = nearestBenchInGroup(benches, last.group, local) || last;
  let bestOther = null;
  let bestInset = -1;
  for (const b of benches) {
    if (b.group === last.group) continue;
    const ins = insetInRect(local, b);
    if (ins > bestInset) {
      bestInset = ins;
      bestOther = b;
    }
  }
  const switched = bestOther && bestInset >= BENCH_SNAP_IN_M;
  if (switched) next = bestOther;
  const size = placed.size;
  const cursorT = benchAlongAt(next, local.x, local.y);
  let along;
  if (switched) {
    along = cursorT - size / 2;
  } else {
    along = cursorT - (Number.isFinite(grabAlong) ? grabAlong : size / 2);
  }
  if (kitchenHangType(type)) {
    along = snapHangAlong(next, along, room, size);
    const { benchKey, alongKey } = kitchenApplianceMeta(type);
    return { ...room, [benchKey]: next.id, [alongKey]: along };
  }
  along = snapPlanMm(Math.max(next.t0, Math.min(next.t1 - size, along)));
  if (type === "cook") return { ...room, cookBench: next.id, cookAlong: along };
  return { ...room, sinkBench: next.id, sinkAlong: along };
}

function startKitchenApplianceDrag(room, type, cursorM) {
  const placed = resolveKitchenAppliance(room, type);
  if (!placed) return { mode: type, grabAlong: 0 };
  const local = worldToUnrotatedLocal(room, cursorM);
  return {
    mode: type,
    grabAlong: benchAlongAt(placed.bench, local.x, local.y) - placed.along,
  };
}

function hitKitchenApplianceHandle(room, layout, raw) {
  const fixtures = kitchenFixtureRects(room);
  if (!fixtures.hasAppliances) return null;
  const hs = fixtureGrabPx(layout);
  const candidates = [
    fixtures.cookGrab ? { type: "cook", px: mPointToPx(fixtures.cookGrab, layout) } : null,
    fixtures.sinkGrab ? { type: "sink", px: mPointToPx(fixtures.sinkGrab, layout) } : null,
    fixtures.pantryGrab ? { type: "pantry", px: mPointToPx(fixtures.pantryGrab, layout) } : null,
    fixtures.fridgeGrab ? { type: "fridge", px: mPointToPx(fixtures.fridgeGrab, layout) } : null,
  ];
  const grab = pickClosestGrab(raw, hs, candidates);
  if (grab) return grab;
  if (fixtures.cook && hitLayoutRect(fixtures.cook, layout, raw, 4)) {
    return { type: "cook", kind: "move" };
  }
  if (fixtures.sinkRect && hitLayoutRect(fixtures.sinkRect, layout, raw, 4)) {
    return { type: "sink", kind: "move" };
  }
  if (fixtures.pantry && hitLayoutRect(fixtures.pantry, layout, raw, 4)) {
    return { type: "pantry", kind: "move" };
  }
  if (fixtures.fridge && hitLayoutRect(fixtures.fridge, layout, raw, 4)) {
    return { type: "fridge", kind: "move" };
  }
  return null;
}

function kitchenFixtureRects(room) {
  const { w, h } = unrotatedSize(room);
  const depth = KITCHEN_BENCH_M;
  const overhang = KITCHEN_OVERHANG_M;
  const barDepth = KITCHEN_BAR_M;
  const longIsX = roomLayoutLongIsX(room);
  const kind = kitchenLayoutKind(room);
  const main = longIsX
    ? { x: 0, y: h - depth, w, h: depth }
    : { x: 0, y: 0, w: depth, h };
  const locals = [main];
  let localPolys = [rectPolygon(main)];
  let localHoles = [];
  let localDashes = [];
  let runHandles = [];
  const barFits = longIsX
    ? h >= depth + barDepth + KITCHEN_CLEAR_M
    : w >= depth + barDepth + KITCHEN_CLEAR_M;
  if (kind === "custom") {
    const segs = customKitchenSegments(room);
    locals.length = 0;
    locals.push(...segs.map((s) => s.rect));
    localPolys = segs.length ? [room.kitchenCustomBench.poly] : [];
  } else if (kind === "lshape-left") {
    if (longIsX) locals.push({ x: 0, y: 0, w: depth, h: Math.max(0.2, h - depth) });
    else locals.push({ x: depth, y: h - depth, w: Math.max(0.2, w - depth), h: depth });
    localPolys = [kitchenLPolygon(w, h, depth, "left", longIsX)];
  } else if (kind === "lshape-right") {
    if (longIsX) locals.push({ x: w - depth, y: 0, w: depth, h: Math.max(0.2, h - depth) });
    else locals.push({ x: depth, y: 0, w: Math.max(0.2, w - depth), h: depth });
    localPolys = [kitchenLPolygon(w, h, depth, "right", longIsX)];
  } else if (kind === "cshape") {
    if (longIsX) {
      locals.push({ x: 0, y: 0, w: depth, h: Math.max(0.2, h - depth) });
      locals.push({ x: w - depth, y: 0, w: depth, h: Math.max(0.2, h - depth) });
    } else {
      locals.push({ x: depth, y: h - depth, w: Math.max(0.2, w - depth), h: depth });
      locals.push({ x: depth, y: 0, w: Math.max(0.2, w - depth), h: depth });
    }
    localPolys = [kitchenCPolygon(w, h, depth, longIsX)];
  } else if (kitchenHasWrap(kind) && barFits) {
    const side = kitchenWrapSide(kind);
    const run = kitchenRunRange(room, w, h, longIsX, kind, side);
    const bar = kitchenBarLayout(w, h, depth, barDepth, side, longIsX, run);
    locals.length = 0;
    locals.push(...bar.locals);
    if (kind === "cbar-left" || kind === "cbar-right") {
      if (longIsX) {
        if (side === "left") {
          locals.push({ x: w - depth, y: 0, w: depth, h: Math.max(0.2, h - depth) });
        } else {
          locals.push({ x: 0, y: 0, w: depth, h: Math.max(0.2, h - depth) });
        }
      } else if (side === "left") {
        locals.push({ x: depth, y: 0, w: Math.max(0.2, w - depth), h: depth });
      } else {
        locals.push({ x: depth, y: h - depth, w: Math.max(0.2, w - depth), h: depth });
      }
      const shape = kitchenCBarShape(w, h, depth, barDepth, longIsX, side, run.t0, run.t1);
      localPolys = [shape.poly];
      localHoles = shape.hole ? [shape.hole] : [];
    } else {
      localPolys = [bar.poly, ...(bar.extraPolys || [])];
    }
    localDashes = bar.dashes;
    runHandles = kitchenRunHandleLocals(
      w,
      h,
      barDepth,
      longIsX,
      run,
      wrapRunFromStart(kind, longIsX) ? ["t1"] : ["t0"]
    );
  } else if (kind === "bar-left" || kind === "cbar-left") {
    if (longIsX) locals.push({ x: 0, y: 0, w: depth, h: Math.max(0.2, h - depth) });
    else locals.push({ x: depth, y: h - depth, w: Math.max(0.2, w - depth), h: depth });
    if (kind === "cbar-left") {
      if (longIsX) locals.push({ x: w - depth, y: 0, w: depth, h: Math.max(0.2, h - depth) });
      else locals.push({ x: depth, y: 0, w: Math.max(0.2, w - depth), h: depth });
      localPolys = [kitchenCPolygon(w, h, depth, longIsX)];
    } else {
      localPolys = [kitchenLPolygon(w, h, depth, "left", longIsX)];
    }
  } else if (kind === "bar-right" || kind === "cbar-right") {
    if (longIsX) locals.push({ x: w - depth, y: 0, w: depth, h: Math.max(0.2, h - depth) });
    else locals.push({ x: depth, y: 0, w: Math.max(0.2, w - depth), h: depth });
    if (kind === "cbar-right") {
      if (longIsX) locals.push({ x: 0, y: 0, w: depth, h: Math.max(0.2, h - depth) });
      else locals.push({ x: depth, y: h - depth, w: Math.max(0.2, w - depth), h: depth });
      localPolys = [kitchenCPolygon(w, h, depth, longIsX)];
    } else {
      localPolys = [kitchenLPolygon(w, h, depth, "right", longIsX)];
    }
  } else if (kind === "island") {
    const run = kitchenRunRange(room, w, h, longIsX, kind, "left");
    if (longIsX) {
      const islandY = 0;
      const gap = main.y - barDepth;
      if (gap + 0.02 >= KITCHEN_CLEAR_M) {
        const island = {
          x: run.t0,
          y: islandY,
          w: Math.max(0.01, run.t1 - run.t0),
          h: barDepth,
        };
        locals.push(island);
        localPolys.push(rectPolygon(island));
        localDashes.push([
          { x: island.x, y: island.y + overhang },
          { x: island.x + island.w, y: island.y + overhang },
        ]);
        runHandles = kitchenRunHandleLocals(w, h, barDepth, longIsX, run);
      }
    } else {
      const islandX = w - barDepth;
      const gap = islandX - main.w;
      if (gap + 0.02 >= KITCHEN_CLEAR_M) {
        const island = {
          x: islandX,
          y: run.t0,
          w: barDepth,
          h: Math.max(0.01, run.t1 - run.t0),
        };
        locals.push(island);
        localPolys.push(rectPolygon(island));
        localDashes.push([
          { x: island.x + depth, y: island.y },
          { x: island.x + depth, y: island.y + island.h },
        ]);
        runHandles = kitchenRunHandleLocals(w, h, barDepth, longIsX, run);
      }
    }
  }
  const cookPlaced = resolveKitchenAppliance(room, "cook");
  const sinkPlaced = resolveKitchenAppliance(room, "sink");
  const pantryPlaced = resolveKitchenAppliance(room, "pantry");
  const fridgePlaced = resolveKitchenAppliance(room, "fridge");
  const cookLocal = cookPlaced
    ? cookLocalOnBench(cookPlaced.bench, cookPlaced.along)
    : { x: 0, y: 0, w: COOKTOP_M, h: COOKTOP_M };
  const pantryLocal = pantryPlaced
    ? pantryLocalOnBench(pantryPlaced.bench, pantryPlaced.along)
    : { x: 0, y: 0, w: PANTRY_M, h: PANTRY_M };
  const fridgeLocal = fridgePlaced
    ? fridgeLocalOnBench(fridgePlaced.bench, fridgePlaced.along)
    : { x: 0, y: 0, w: FRIDGE_ACROSS_M, h: FRIDGE_ALONG_M };
  const sinkLocal = sinkPlaced
    ? sinkFrameOnBench(sinkPlaced.bench, sinkPlaced.along)
    : {
        origin: { x: 0, y: 0 },
        along: { x: SINK_ALONG_M, y: 0 },
        across: { x: 0, y: -SINK_ACROSS_M },
      };
  const sinkBox = sinkPlaced ? sinkRectOnBench(sinkPlaced.bench, sinkPlaced.along) : cookLocal;
  const cookGrabLocal = {
    x: cookLocal.x + cookLocal.w / 2,
    y: cookLocal.y + cookLocal.h / 2,
  };
  const pantryGrabLocal = {
    x: pantryLocal.x + pantryLocal.w / 2,
    y: pantryLocal.y + pantryLocal.h / 2,
  };
  const fridgeGrabLocal = {
    x: fridgeLocal.x + fridgeLocal.w / 2,
    y: fridgeLocal.y + fridgeLocal.h / 2,
  };
  const sinkGrabLocal = {
    x: sinkLocal.origin.x + sinkLocal.along.x / 2 + sinkLocal.across.x / 2,
    y: sinkLocal.origin.y + sinkLocal.along.y / 2 + sinkLocal.across.y / 2,
  };
  return {
    kind,
    hasAppliances: Boolean(cookPlaced),
    benches: locals.map((rect) => rotatedLocalRect(room, rect)),
    benchPolys: localPolys.map((poly) => poly.map((p) => rotatedLocalPoint(room, p))),
    benchHoles: localHoles.map((poly) => poly.map((p) => rotatedLocalPoint(room, p))),
    overhangSegs: localDashes.map((seg) => seg.map((p) => rotatedLocalPoint(room, p))),
    runHandles,
    cook: rotatedLocalRect(room, cookLocal),
    pantry: rotatedLocalRect(room, pantryLocal),
    fridge: rotatedLocalRect(room, fridgeLocal),
    sinkRect: rotatedLocalRect(room, sinkBox),
    sinkLocal,
    cookGrab: rotatedLocalPoint(room, cookGrabLocal),
    pantryGrab: rotatedLocalPoint(room, pantryGrabLocal),
    fridgeGrab: rotatedLocalPoint(room, fridgeGrabLocal),
    sinkGrab: rotatedLocalPoint(room, sinkGrabLocal),
  };
}

function sinkMirrored(room) {
  return Boolean(room?.sinkMirror);
}

function kitchenSinkParts(W, H, mirror = false) {
  const sx = W / 1155;
  const sy = H / 495;
  const s = Math.min(sx, sy);
  const rimL = 20 * sx;
  const rimR = 20 * sx;
  const rear = 58 * sy;
  const bowlW = 340 * sx;
  const bowl1W = bowlW * 0.75;
  const bowl2W = bowlW;
  const bowlH = 400 * sy;
  const frontGap = 495 * sy - bowlH - rear;
  const bowlY = frontGap;
  const divider = 35 * sx;
  const gap = 45 * sx;
  const drainW = Math.max(8 * sx, W - rimL - rimR - gap - bowl1W - divider - bowl2W);
  const bowlShift = -30 * sx;
  const bowl1X = rimL + drainW + gap + bowlShift;
  const bowl2X = bowl1X + bowl1W + divider;
  const grooveY0 = 90 * sy;
  const grooveY1 = H - 90 * sy;
  const tapX = bowl1X + bowl1W + divider / 2;
  const grooveX0 = rimL + 55 * sx;
  const grooveX1 = rimL + drainW - 55 * sx;
  if (mirror) {
    const flip = (x, w) => W - x - w;
    return {
      drainW,
      gap,
      bowl1W,
      bowl2W,
      bowlH,
      bowlY,
      bowl1X: flip(bowl1X, bowl1W),
      bowl2X: flip(bowl2X, bowl2W),
      rx: 42 * s,
      drainR: 45 * s,
      tapX: W - tapX,
      tapY: rear * 0.48,
      tapR: 9 * s,
      grooveX0: W - grooveX1,
      grooveX1: W - grooveX0,
      grooveY0,
      grooveY1,
      grooveCount: Math.max(2, Math.round((grooveY1 - grooveY0) / (35 * sy)) + 1),
      outerRx: 14 * s,
      rimL,
      rear,
    };
  }
  return {
    drainW,
    gap,
    bowl1W,
    bowl2W,
    bowlH,
    bowlY,
    bowl1X,
    bowl2X,
    rx: 42 * s,
    drainR: 45 * s,
    tapX,
    tapY: rear * 0.48,
    tapR: 9 * s,
    grooveX0,
    grooveX1,
    grooveY0,
    grooveY1,
    grooveCount: Math.max(2, Math.round((grooveY1 - grooveY0) / (35 * sy)) + 1),
    outerRx: 14 * s,
    rimL,
    rear,
  };
}

function kitchenSinkGrooves(p) {
  const n = p.grooveCount;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    out.push({ y: p.grooveY0 + (p.grooveY1 - p.grooveY0) * t, x1: p.grooveX0, x2: p.grooveX1 });
  }
  return out;
}

function kitchenSinkFramePx(room, layout, sinkLocal) {
  if (!sinkLocal?.origin) return null;
  const o = mPointToPx(rotatedLocalPoint(room, sinkLocal.origin), layout);
  const a = mPointToPx(
    rotatedLocalPoint(room, {
      x: sinkLocal.origin.x + sinkLocal.along.x,
      y: sinkLocal.origin.y + sinkLocal.along.y,
    }),
    layout
  );
  const c = mPointToPx(
    rotatedLocalPoint(room, {
      x: sinkLocal.origin.x + sinkLocal.across.x,
      y: sinkLocal.origin.y + sinkLocal.across.y,
    }),
    layout
  );
  const W = Math.hypot(a.x - o.x, a.y - o.y);
  const H = Math.hypot(c.x - o.x, c.y - o.y);
  if (W < 8 || H < 6) return null;
  return { o, a, c, W, H };
}

function paintKitchenSink(ctx, room, layout, sinkLocal, bw) {
  const frame = kitchenSinkFramePx(room, layout, sinkLocal);
  if (!frame) return;
  const { o, a, c, W, H } = frame;
  const p = kitchenSinkParts(W, H, sinkMirrored(room));
  const edge = bw ? "#111" : PLAN_STEEL_EDGE;
  ctx.save();
  ctx.transform((a.x - o.x) / W, (a.y - o.y) / W, (c.x - o.x) / H, (c.y - o.y) / H, o.x, o.y);
  ctx.lineWidth = 1.1;
  ctx.fillStyle = bw ? "transparent" : canvasSilver(ctx, 0, 0, W, H);
  ctx.strokeStyle = edge;
  drawCanvasRoundRect(ctx, 0, 0, W, H, p.outerRx);
  if (!bw) ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = bw ? "#111" : PLAN_STEEL_GROOVE;
  ctx.lineWidth = Math.max(0.8, H * 0.028);
  ctx.lineCap = "round";
  for (const g of kitchenSinkGrooves(p)) {
    ctx.beginPath();
    ctx.moveTo(g.x1, g.y);
    ctx.lineTo(g.x2, g.y);
    ctx.stroke();
  }
  const bowls = [
    { x: p.bowl1X, w: p.bowl1W },
    { x: p.bowl2X, w: p.bowl2W },
  ];
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = edge;
  for (const b of bowls) {
    ctx.fillStyle = bw ? "transparent" : canvasSilver(ctx, b.x, p.bowlY, b.w, p.bowlH, true);
    drawCanvasRoundRect(ctx, b.x, p.bowlY, b.w, p.bowlH, p.rx);
    if (!bw) ctx.fill();
    ctx.stroke();
    const cx = b.x + b.w / 2;
    const cy = p.bowlY + p.bowlH * 0.58;
    ctx.beginPath();
    ctx.arc(cx, cy, p.drainR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, p.drainR * 0.28, 0, Math.PI * 2);
    if (!bw) {
      ctx.fillStyle = PLAN_STEEL_EDGE;
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.arc(p.tapX, p.tapY, p.tapR, 0, Math.PI * 2);
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1;
  if (!bw) {
    ctx.fillStyle = canvasSilver(ctx, p.tapX - p.tapR, p.tapY - p.tapR, p.tapR * 2, p.tapR * 2);
    ctx.fill();
  }
  ctx.stroke();
  ctx.restore();
}

function paintKitchenLabelBox(ctx, r, label, bw, stroke) {
  ctx.fillStyle = bw ? "transparent" : "#ffffff";
  ctx.strokeStyle = stroke || "#2f2f2f";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  if (!bw) ctx.fill();
  ctx.stroke();
  const short = Math.min(r.w, r.h);
  ctx.font = `700 ${Math.max(9, short * 0.28)}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = stroke || "#2f2f2f";
  ctx.fillText(label, r.x + Math.max(3, r.w * 0.08), r.y + r.h - Math.max(3, r.h * 0.08));
}

function drawExportRoomFixtures(ctx, room, layout, bw, innerMetres, walls) {
  const kind = roomKind(room);
  const stroke = bw ? "#111" : null;
  if (kind === "living") {
    drawLivingSetCanvas(ctx, room, layout, bw);
    return;
  }
  if (kind === "laundry") {
    drawLaundryCanvas(ctx, room, layout, bw, stroke, innerMetres);
    return;
  }
  if (kind === "laundryRoom") {
    drawLaundryRoomCanvas(ctx, room, layout, bw, stroke, innerMetres);
    return;
  }
  if (kind === "bathroom" || kind === "powder") {
    const { shower, tank, bowl, toiletGeom } = bathroomFixtures(room);
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = stroke || PLAN_CERAMIC_EDGE;
    if (shower) {
      const s = mRectToPx(shower, layout);
      const drainR = Math.max(2, Math.min(s.w, s.h) * 0.07);
      ctx.fillStyle = bw ? "transparent" : PLAN_GLASS;
      ctx.beginPath();
      ctx.rect(s.x, s.y, s.w, s.h);
      if (!bw) ctx.fill();
      ctx.stroke();
      const wasteX = s.x + s.w / 2;
      const wasteY = s.y + s.h / 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(wasteX, wasteY);
      ctx.moveTo(s.x + s.w, s.y);
      ctx.lineTo(wasteX, wasteY);
      ctx.moveTo(s.x + s.w, s.y + s.h);
      ctx.lineTo(wasteX, wasteY);
      ctx.moveTo(s.x, s.y + s.h);
      ctx.lineTo(wasteX, wasteY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(wasteX, wasteY, drainR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(wasteX, wasteY, Math.max(1, drainR * 0.35), 0, Math.PI * 2);
      ctx.fillStyle = stroke || PLAN_CERAMIC_EDGE;
      ctx.fill();
      const parts = showerPlanParts(shower, showerRotOf(room), walls);
      const glass = glassPanelPx(parts.glass, parts.side, layout);
      const head = mPointToPx(parts.head, layout);
      ctx.fillStyle = bw ? "transparent" : "rgba(120, 168, 186, 0.88)";
      ctx.strokeStyle = stroke || "#5d7e8c";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.rect(glass.x, glass.y, glass.w, glass.h);
      if (!bw) ctx.fill();
      ctx.stroke();
      const headR = Math.max(3.5, 0.07 * layout.scale);
      ctx.beginPath();
      ctx.arc(head.x, head.y, headR, 0, Math.PI * 2);
      ctx.fillStyle = bw ? "transparent" : "#ffffff";
      ctx.strokeStyle = stroke || PLAN_CERAMIC_EDGE;
      ctx.lineWidth = 1.3;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(head.x, head.y, Math.max(1.2, headR * 0.28), 0, Math.PI * 2);
      ctx.fillStyle = stroke || PLAN_CERAMIC_EDGE;
      ctx.fill();
      const spray = Math.max(6, 0.12 * layout.scale);
      ctx.strokeStyle = stroke || PLAN_CERAMIC_EDGE;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (const spread of [-0.45, 0, 0.45]) {
        const dx = parts.aim.x * Math.cos(spread) - parts.aim.y * Math.sin(spread);
        const dy = parts.aim.x * Math.sin(spread) + parts.aim.y * Math.cos(spread);
        ctx.moveTo(head.x + dx * headR * 1.15, head.y + dy * headR * 1.15);
        ctx.lineTo(head.x + dx * (headR + spray), head.y + dy * (headR + spray));
      }
      ctx.stroke();
    }
    const t = tank ? mRectToPx(tank, layout) : null;
    const b = bowl ? mRectToPx(bowl, layout) : null;
    const clearPx = toiletGeom?.clear ? mRectToPx(toiletGeom.clear, layout) : null;
    if (clearPx) {
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.15;
      ctx.lineCap = "round";
      ctx.strokeStyle = stroke || PLAN_CERAMIC_EDGE;
      ctx.fillStyle = "transparent";
      ctx.beginPath();
      ctx.rect(clearPx.x, clearPx.y, clearPx.w, clearPx.h);
      ctx.stroke();
      ctx.restore();
    }
    if (t && b) {
      ctx.fillStyle = bw ? "transparent" : PLAN_CERAMIC;
      ctx.strokeStyle = stroke || PLAN_CERAMIC_EDGE;
      drawRoundedFrontRect(ctx, b, toiletBowlFront(toiletGeom?.toiletSide));
      ctx.beginPath();
      ctx.rect(t.x, t.y, t.w, t.h);
      if (!bw) ctx.fill();
      ctx.stroke();
    }
    const vanity = bathroomVanity(room, innerMetres);
    if (vanity) {
      const vr = mRectToPx(vanity.rect, layout);
      const basin = mRectToPx(vanity.basin, layout);
      ctx.lineWidth = 1.2;
      ctx.fillStyle = bw ? "transparent" : "#ffffff";
      ctx.strokeStyle = stroke || PLAN_CERAMIC_EDGE;
      ctx.beginPath();
      ctx.rect(vr.x, vr.y, vr.w, vr.h);
      if (!bw) ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(
        basin.x + basin.w / 2,
        basin.y + basin.h / 2,
        basin.w / 2,
        basin.h / 2,
        0,
        0,
        Math.PI * 2
      );
      if (!bw) {
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }
      ctx.stroke();
      if (vanity.wm) {
        const wr = mRectToPx(vanity.wm.rect, layout);
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = stroke || "#2f2f2f";
        ctx.strokeRect(wr.x, wr.y, wr.w, wr.h);
        ctx.setLineDash([]);
        ctx.fillStyle = stroke || "#2f2f2f";
        ctx.font = `700 ${wmLabelPx(wr)}px "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillText("WM", wr.x + Math.max(3, wr.w * 0.08), wr.y + wr.h - Math.max(3, wr.h * 0.08));
        ctx.restore();
      }
    }
    const door = roomDoorSwing(room, innerMetres);
    if (door) {
      if (!door.sliding) {
        if (bw) drawDoorSwingCanvas(ctx, door, layout, "#111");
        else drawPlanDoorSwingCanvas(ctx, door, layout);
      }
      if (!bw || door.sliding) {
        const dl = mPointToPx(door.doorLabel, layout);
        ctx.font = '700 11px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        drawHaloText(
          ctx,
          formatPlanMm(door.doorWidth),
          dl.x,
          dl.y,
          bw ? "#111111" : PLAN_WOOD_EDGE,
          "rgba(255,255,255,0.95)"
        );
      }
    }
    return;
  }
  if (kind === "kitchen") {
    const { benchPolys, benchHoles, overhangSegs, cook, pantry, fridge, sinkLocal, hasAppliances } =
      kitchenFixtureRects(room);
    ctx.lineWidth = 1.1;
    ctx.fillStyle = bw ? "transparent" : PLAN_WOOD;
    ctx.strokeStyle = stroke || PLAN_WOOD_EDGE;
    ctx.lineJoin = "round";
    const paintPoly = (poly) => {
      const pts = poly.map((p) => mPointToPx(p, layout));
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
    };
    if (benchHoles?.length) {
      ctx.beginPath();
      paintPoly(benchPolys[0]);
      for (const hole of benchHoles) paintPoly(hole);
      if (!bw) ctx.fill("evenodd");
      ctx.stroke();
      for (let i = 1; i < benchPolys.length; i += 1) {
        ctx.beginPath();
        paintPoly(benchPolys[i]);
        if (!bw) ctx.fill();
        ctx.stroke();
      }
    } else {
      for (const poly of benchPolys) {
        ctx.beginPath();
        paintPoly(poly);
        if (!bw) ctx.fill();
        ctx.stroke();
      }
    }
    if (overhangSegs.length) {
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.15;
      ctx.lineCap = "round";
      ctx.strokeStyle = stroke || PLAN_WOOD_EDGE;
      for (const seg of overhangSegs) {
        const a = mPointToPx(seg[0], layout);
        const b = mPointToPx(seg[1], layout);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (!hasAppliances) return;
    const c = mRectToPx(cook, layout);
    ctx.fillStyle = bw ? "transparent" : PLAN_COOK;
    ctx.strokeStyle = stroke || "#2f2f2f";
    drawCanvasRoundRect(ctx, c.x, c.y, c.w, c.h, Math.max(2, layout.scale * 0.04));
    if (!bw) ctx.fill();
    ctx.stroke();
    if (!bw) {
      ctx.strokeStyle = "#2a2a2a";
      for (const fx of [0.3, 0.7]) {
        for (const fy of [0.3, 0.7]) {
          ctx.beginPath();
          ctx.arc(
            c.x + c.w * fx,
            c.y + c.h * fy,
            Math.max(2, Math.min(c.w, c.h) * 0.14),
            0,
            Math.PI * 2
          );
          ctx.stroke();
        }
      }
    }
    paintKitchenSink(ctx, room, layout, sinkLocal, bw);
    const ptry = mRectToPx(pantry, layout);
    paintKitchenLabelBox(ctx, ptry, "P", bw, stroke);
    const frg = mRectToPx(fridge, layout);
    paintKitchenLabelBox(ctx, frg, "F", bw, stroke);
    return;
  }
  if (kind === "porch") {
    const boardM = 0.09;
    const gapM = 0.008;
    for (const part of porchFootprints(room)) {
      const r = roomToPx(part, layout);
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
      if (!bw) {
        ctx.fillStyle = ROOM_PORCH_FILL;
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
      const longIsX = part.w >= part.h;
      const span = longIsX ? part.h : part.w;
      const n = Math.max(2, Math.round((span + gapM) / (boardM + gapM)));
      const board = (span - (n - 1) * gapM) / n;
      for (let i = 0; i < n; i += 1) {
        const off = i * (board + gapM);
        const rect = longIsX
          ? { x: part.x, y: part.y + off, w: part.w, h: board }
          : { x: part.x + off, y: part.y, w: board, h: part.h };
        const p = mRectToPx(rect, layout);
        ctx.fillStyle = bw ? "transparent" : DECK_STAINS[i % DECK_STAINS.length];
        ctx.strokeStyle = bw ? "#111" : DECK_EDGE;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(p.x, p.y, p.w, p.h);
        if (!bw) ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
      if (!bw) {
        ctx.strokeStyle = ROOM_PORCH;
        ctx.lineWidth = PLAN_LINE;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
      }
    }
    for (const step of porchStepFlight(room, layout.metres)) {
      const p = mRectToPx(step, layout);
      ctx.fillStyle = bw ? "transparent" : DECK_STAINS[(step.i + 1) % DECK_STAINS.length];
      ctx.strokeStyle = bw ? "#111111" : DECK_EDGE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(p.x, p.y, p.w, p.h);
      if (!bw) ctx.fill();
      ctx.stroke();
    }
    const front = porchFrontDoor(room, layout.metres);
    if (front) {
      drawPorchFrontDoorOpening(ctx, front, layout, bw);
      if (bw) drawDoorSwingCanvas(ctx, front, layout, "#111111");
      else drawPlanDoorSwingCanvas(ctx, front, layout);
    }
    return;
  }
  const { bed, pillows, duvet, runner, fold, nightstands } = bedLayout(room, innerMetres);
  const b = mRectToPx(bed, layout);
  const rad = Math.max(2, layout.scale * 0.04);
  if (!bw) {
    for (const ns of nightstands || []) {
      const p = mRectToPx(ns, layout);
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;
      const lr = Math.min(p.w, p.h) * 0.28;
      ctx.fillStyle = PLAN_WOOD;
      ctx.strokeStyle = PLAN_WOOD_EDGE;
      drawCanvasRoundRect(ctx, p.x, p.y, p.w, p.h, Math.max(1.5, layout.scale * 0.03));
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, lr, 0, Math.PI * 2);
      ctx.fillStyle = PLAN_LAMP;
      ctx.strokeStyle = PLAN_WOOD_DARK;
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = PLAN_WOOD;
    ctx.strokeStyle = PLAN_WOOD_EDGE;
    ctx.lineWidth = 1.2;
    drawCanvasRoundRect(ctx, b.x, b.y, b.w, b.h, rad);
    ctx.fill();
    ctx.stroke();
    if (duvet) {
      const d = mRectToPx(duvet, layout);
      ctx.fillStyle = PLAN_LINEN;
      ctx.strokeStyle = PLAN_LINEN_EDGE;
      ctx.lineWidth = 1;
      drawCanvasRoundRect(ctx, d.x, d.y, d.w, d.h, Math.max(2, layout.scale * 0.05));
      ctx.fill();
      ctx.stroke();
    }
    if (fold) {
      const f = mRectToPx(fold, layout);
      ctx.fillStyle = PLAN_LINEN_EDGE;
      ctx.fillRect(f.x, f.y, f.w, f.h);
    }
    if (runner) {
      const rn = mRectToPx(runner, layout);
      ctx.fillStyle = PLAN_RUNNER;
      ctx.strokeStyle = PLAN_WOOD_DARK;
      ctx.beginPath();
      ctx.rect(rn.x, rn.y, rn.w, rn.h);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = "#fbfaf6";
    ctx.strokeStyle = "#c5bfb4";
    for (const pillow of pillows || []) {
      const p = mRectToPx(pillow, layout);
      drawCanvasRoundRect(ctx, p.x, p.y, p.w, p.h, rad * 0.8);
      ctx.fill();
      ctx.stroke();
    }
  } else {
    ctx.lineWidth = 1.1;
    ctx.fillStyle = "transparent";
    ctx.strokeStyle = "#111";
    drawCanvasRoundRect(ctx, b.x, b.y, b.w, b.h, rad);
    ctx.stroke();
    for (const pillow of pillows || []) {
      const p = mRectToPx(pillow, layout);
      drawCanvasRoundRect(ctx, p.x, p.y, p.w, p.h, rad * 0.8);
      ctx.stroke();
    }
  }
  const geom = bedroomDoorAndRobe(room, innerMetres);
  if (geom) drawBedroomDoorRobe(ctx, geom, layout, bw);
}

function drawPorchFrontDoorOpening(ctx, door, layout, bw) {
  const opening = porchFrontDoorOpening(door);
  if (!opening) return;
  const pts = opening.pts.map((p) => mPointToPx(p, layout));
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  if (!bw) {
    ctx.save();
    ctx.clip();
    drawHybridPlanks(ctx, layout);
    ctx.restore();
  }
  ctx.strokeStyle = bw ? "#111111" : MONUMENT;
  ctx.lineWidth = PLAN_LINE;
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  for (const jamb of opening.jambs) {
    const a = mPointToPx(jamb[0], layout);
    const b = mPointToPx(jamb[1], layout);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDoorSwingCanvas(ctx, door, layout, color) {
  if (!door) return;
  const hinge = mPointToPx(door.hinge, layout);
  const closed = mPointToPx(door.closed, layout);
  const open = mPointToPx(door.open, layout);
  const radius = Math.max(1, door.doorWidth * layout.scale);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(hinge.x, hinge.y);
  ctx.lineTo(open.x, open.y);
  ctx.stroke();
  ctx.beginPath();
  const start = Math.atan2(closed.y - hinge.y, closed.x - hinge.x);
  const end = Math.atan2(open.y - hinge.y, open.x - hinge.x);
  ctx.arc(hinge.x, hinge.y, radius, start, end, !door.cw);
  ctx.stroke();
  const dl = mPointToPx(door.doorLabel, layout);
  ctx.font = '700 11px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  drawHaloText(ctx, formatPlanMm(door.doorWidth), dl.x, dl.y, color, "rgba(255,255,255,0.95)");
  ctx.restore();
}

function drawPlanDoorSwingCanvas(ctx, door, layout) {
  if (!door || door.sliding) return;
  const hinge = mPointToPx(door.hinge, layout);
  const closed = mPointToPx(door.closed, layout);
  const open = mPointToPx(door.open, layout);
  const radius = Math.max(1, door.doorWidth * layout.scale);
  const leaf = doorLeafQuad(hinge, open, doorLeafThicknessPx(layout), closed);
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = WALL_FILL;
  ctx.lineWidth = 1.15;
  ctx.lineCap = "round";
  ctx.beginPath();
  const start = Math.atan2(closed.y - hinge.y, closed.x - hinge.x);
  const end = Math.atan2(open.y - hinge.y, open.x - hinge.x);
  ctx.arc(hinge.x, hinge.y, radius, start, end, !door.cw);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(leaf[0].x, leaf[0].y);
  for (let i = 1; i < leaf.length; i += 1) ctx.lineTo(leaf[i].x, leaf[i].y);
  ctx.closePath();
  ctx.fillStyle = PLAN_WOOD;
  ctx.strokeStyle = PLAN_WOOD_EDGE;
  ctx.lineWidth = 1;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function traceQuad(ctx, quad, layout) {
  const pts = (quad || []).map((p) => mPointToPx(p, layout));
  if (pts.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

function drawSlidingDoorCanvas(ctx, door, layout, bw) {
  if (!door?.sliding) return;
  ctx.save();
  const pocket = door.cavityQuad
    ? Math.hypot(door.cavityQuad[1].x - door.cavityQuad[0].x, door.cavityQuad[1].y - door.cavityQuad[0].y)
    : 0;
  if (pocket > 0.02) {
    traceQuad(ctx, door.cavityQuad, layout);
    ctx.fillStyle = bw ? "#ffffff" : "#f4f1ea";
    ctx.strokeStyle = bw ? "#111111" : WALL_FILL;
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
  }
  traceQuad(ctx, door.leafQuad, layout);
  ctx.fillStyle = bw ? "#ffffff" : PLAN_WOOD;
  ctx.strokeStyle = bw ? "#111111" : PLAN_WOOD_EDGE;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

const DIM_CLEAR_M = 1;
const DIM_LINE_GAP_M = 0.55;
const DIM_CHAIN_GAP_PX = 44;
const DIM_STATION_TOL_M = 0.01;

function dimLabelAngle(dx, dy) {
  let angle = Math.atan2(dy, dx);
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle < -Math.PI / 2) angle += Math.PI;
  return angle;
}
const AREA_LABEL_GAP_PX = 8;

function drawLinearDim(ctx, ax, ay, bx, by, label, color, tick = 5, outX = 0, outY = -1, name = null) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ol = Math.hypot(outX, outY) || 1;
  const ox = outX / ol;
  const oy = outY / ol;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax - ox * tick, ay - oy * tick);
  ctx.moveTo(bx, by);
  ctx.lineTo(bx - ox * tick, by - oy * tick);
  ctx.stroke();
  const angle = dimLabelAngle(dx, dy);
  const midX = (ax + bx) / 2;
  const midY = (ay + by) / 2;
  const paint = (text, font, localY) => {
    ctx.save();
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.translate(midX, midY);
    ctx.rotate(angle);
    ctx.fillText(text, 0, localY);
    ctx.restore();
  };
  if (name) {
    const size = [10, 8].find((px) => {
      ctx.font = `600 ${px}px "Segoe UI", system-ui, sans-serif`;
      return ctx.measureText(name).width <= len - 8;
    });
    if (size) paint(name, `600 ${size}px "Segoe UI", system-ui, sans-serif`, -10);
  }
  if (label) {
    const compact = len < 22;
    paint(
      label,
      compact
        ? '700 8px "Segoe UI", system-ui, sans-serif'
        : '700 11px "Segoe UI", system-ui, sans-serif',
      compact ? 11 : 12
    );
  }
  ctx.restore();
}

function dimEdgeMatchM() {
  return WALL_THICKNESS_M + 0.06;
}

function splitsOnHEdge(y, t0, t1, inner, outer) {
  const pts = [t0, t1];
  const match = dimEdgeMatchM();
  const pushIf = (x) => {
    if (x >= t0 - 0.02 && x <= t1 + 0.02) pts.push(x);
  };
  for (const p of outer || []) {
    if (almostEqualM(p.y, y, match)) pushIf(p.x);
  }
  for (const p of inner || []) {
    if (almostEqualM(p.y, y, match)) pushIf(p.x);
  }
  return uniqueSortedMetres(pts, 0.02);
}

function splitsOnVEdge(x, t0, t1, inner, outer) {
  const pts = [t0, t1];
  const match = dimEdgeMatchM();
  const pushIf = (y) => {
    if (y >= t0 - 0.02 && y <= t1 + 0.02) pts.push(y);
  };
  for (const p of outer || []) {
    if (almostEqualM(p.x, x, match)) pushIf(p.y);
  }
  for (const p of inner || []) {
    if (almostEqualM(p.x, x, match)) pushIf(p.y);
  }
  return uniqueSortedMetres(pts, 0.02);
}

function inflateWallStations(coords, walls, axis) {
  const half = WALL_THICKNESS_M / 2;
  let pts = (coords || []).slice();
  for (const w of walls || []) {
    const pos = axis === "x" ? (w.axis === "v" ? w.x : null) : w.axis === "h" ? w.y : null;
    if (pos == null) continue;
    if (!pts.some((p) => Math.abs(p - pos) <= 0.08)) continue;
    pts = pts.filter((p) => Math.abs(p - pos) > 0.03);
    pts.push(pos - half, pos + half);
  }
  return uniqueSortedMetres(pts, 0.015);
}

function nearerHSide(y0, y1, b) {
  const lo = Math.min(y0, y1);
  const hi = Math.max(y0, y1);
  const distTop = Math.max(0, lo - b.minY);
  const distBot = Math.max(0, b.maxY - hi);
  return distTop <= distBot ? "top" : "bottom";
}

function nearerVSide(x0, x1, b) {
  const lo = Math.min(x0, x1);
  const hi = Math.max(x0, x1);
  const distLeft = Math.max(0, lo - b.minX);
  const distRight = Math.max(0, b.maxX - hi);
  return distLeft <= distRight ? "left" : "right";
}

function spanKey(coords) {
  const parts = [];
  for (let i = 0; i < (coords || []).length - 1; i += 1) {
    const span = coords[i + 1] - coords[i];
    if (span < DIM_STATION_TOL_M) continue;
    parts.push(String(Math.round(span * 1000)));
  }
  return parts.join("|");
}

function dimStations(values) {
  return uniqueSortedMetres(values, DIM_STATION_TOL_M);
}

function drawDimChain(ctx, coords, horizontal, linePos, toX, toY, outX, outY, color, nameFor = null) {
  const stations = dimStations(coords);
  if (!stations || stations.length < 2) return;
  for (let i = 0; i < stations.length - 1; i += 1) {
    const a = stations[i];
    const b = stations[i + 1];
    const span = b - a;
    if (span < DIM_STATION_TOL_M) continue;
    const label = String(Math.round(span * 1000));
    const name = nameFor ? nameFor(a, b) : null;
    if (horizontal) {
      drawLinearDim(ctx, toX(a), linePos, toX(b), linePos, label, color, 5, outX, outY, name);
    } else {
      drawLinearDim(ctx, linePos, toY(a), linePos, toY(b), label, color, 5, outX, outY, name);
    }
  }
}

const DIM_NAME_MIN_SPAN_M = 0.3;

/**
 * Name of the first space met when walking in from `side` at the middle of span [a, b]:
 * a room's name, "Living" for open floor, or null for walls / outside.
 */
function dimSpanNamer(side, foot, inner, rooms) {
  return (a, b) => {
    if (b - a < DIM_NAME_MIN_SPAN_M) return null;
    const mid = (a + b) / 2;
    const horizontal = side === "top" || side === "bottom";
    const from = side === "top" ? foot.minY : side === "bottom" ? foot.maxY : side === "left" ? foot.minX : foot.maxX;
    const to = side === "top" ? foot.maxY : side === "bottom" ? foot.minY : side === "left" ? foot.maxX : foot.minX;
    const dir = to >= from ? 1 : -1;
    for (let d = 0.15; d < Math.abs(to - from); d += 0.1) {
      const across = from + dir * d;
      const p = horizontal ? { x: mid, y: across } : { x: across, y: mid };
      const room = (rooms || []).find((r) => pointInRoom(p, r));
      if (room) return roomKindLabel(roomKind(room));
      if (inner?.length && pointInPolygon(p, inner)) return "Living";
    }
    return null;
  };
}

function facingSide(edge) {
  if (edge.axis === "h") return edge.ny < 0 ? "top" : "bottom";
  return edge.nx < 0 ? "left" : "right";
}

function drawExportDimensionRuns(ctx, layout, rooms, innerMetres, walls, color) {
  const outer = layout.metres || [];
  if (outer.length < 3) return;
  const ppm = layout.scale;
  const toX = (m) => m * ppm + layout.originX;
  const toY = (m) => m * ppm + layout.originY;
  const b = buildingBounds(outer);
  const foot = planFootprintBounds(outer, rooms) || b;
  const coords = { top: [], bottom: [], left: [], right: [] };
  const sideWalls = { top: [], bottom: [], left: [], right: [] };

  for (let i = 0; i < outer.length; i += 1) {
    const a = outer[i];
    const c = outer[(i + 1) % outer.length];
    const edge = axisEdgeFromPoints(a, c);
    if (!edge) continue;
    const inward = polygonEdgeInwardNormal(outer, a, c);
    const nx = -inward.nx;
    const ny = -inward.ny;
    const side = facingSide({ ...edge, nx, ny });
    const splits =
      edge.axis === "h"
        ? splitsOnHEdge(edge.y, edge.t0, edge.t1, innerMetres, outer)
        : splitsOnVEdge(edge.x, edge.t0, edge.t1, innerMetres, outer);
    coords[side].push(...splits);
  }

  for (const r of rooms || []) {
    if (roomKind(r) === "kitchen" || isLivingSet(r)) continue;
    const hSide = nearerHSide(r.y, r.y + r.h, b);
    coords[hSide].push(r.x, r.x + r.w);
    const vSide = nearerVSide(r.x, r.x + r.w, b);
    coords[vSide].push(r.y, r.y + r.h);
  }

  for (const w of walls || []) {
    if (w.axis === "v") {
      const side = nearerHSide(w.t0, w.t1, b);
      coords[side].push(w.x);
      sideWalls[side].push(w);
    } else {
      const side = nearerVSide(w.t0, w.t1, b);
      coords[side].push(w.y);
      sideWalls[side].push(w);
    }
  }

  for (const side of Object.keys(coords)) {
    const axis = side === "top" || side === "bottom" ? "x" : "y";
    coords[side] = dimStations(
      inflateWallStations(uniqueSortedMetres(coords[side], 0.02), sideWalls[side], axis)
    );
  }

  const topKey = spanKey(coords.top);
  const botKey = spanKey(coords.bottom);
  const leftKey = spanKey(coords.left);
  const rightKey = spanKey(coords.right);
  const overallX = dimStations([b.minX, b.maxX]);
  const overallY = dimStations([b.minY, b.maxY]);
  const overallXKey = spanKey(overallX);
  const overallYKey = spanKey(overallY);
  const showTopInner = Boolean(topKey) && topKey !== overallXKey;
  const showBotInner = Boolean(botKey) && botKey !== topKey && botKey !== overallXKey;
  const showLeftInner = Boolean(leftKey) && leftKey !== overallYKey;
  const showRightInner = Boolean(rightKey) && rightKey !== leftKey && rightKey !== overallYKey;

  const innerOffPx = DIM_CLEAR_M * ppm;
  const overallOffPx = innerOffPx + Math.max(DIM_LINE_GAP_M * ppm, DIM_CHAIN_GAP_PX);
  const topLineY = toY(foot.minY) - innerOffPx;
  const botLineY = toY(foot.maxY) + innerOffPx;
  const leftLineX = toX(foot.minX) - innerOffPx;
  const rightLineX = toX(foot.maxX) + innerOffPx;
  const topOverallY = toY(foot.minY) - (showTopInner ? overallOffPx : innerOffPx);
  const leftOverallX = toX(foot.minX) - (showLeftInner ? overallOffPx : innerOffPx);

  const namedRooms = (rooms || []).filter((r) => !isLivingSet(r));
  const namer = (side) => dimSpanNamer(side, foot, innerMetres, namedRooms);

  if (showTopInner) {
    drawDimChain(ctx, coords.top, true, topLineY, toX, toY, 0, -1, color, namer("top"));
  }
  drawDimChain(ctx, overallX, true, topOverallY, toX, toY, 0, -1, color);

  if (showBotInner) {
    drawDimChain(ctx, coords.bottom, true, botLineY, toX, toY, 0, 1, color, namer("bottom"));
  }

  if (showLeftInner) {
    drawDimChain(ctx, coords.left, false, leftLineX, toX, toY, -1, 0, color, namer("left"));
  }
  drawDimChain(ctx, overallY, false, leftOverallX, toX, toY, -1, 0, color);

  if (showRightInner) {
    drawDimChain(ctx, coords.right, false, rightLineX, toX, toY, 1, 0, color, namer("right"));
  }
}

function PlanDimensionsOverlay({ layout, rooms, innerMetres, walls, width, height }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout || !(width > 0) || !(height > 0)) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    drawExportDimensionRuns(ctx, layout, rooms, innerMetres, walls, MONUMENT);
  }, [layout, rooms, innerMetres, walls, width, height]);
  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: `${width}px`,
        height: `${height}px`,
        pointerEvents: "none",
      }}
    />
  );
}

function buildDesignExportCanvas(layout, rooms, options = {}) {
  const mode = options.mode === "color" ? "color" : "bw";
  const dimensions = options.dimensions !== false;
  const bw = mode === "bw";
  const scale = options.scale > 0 ? options.scale : 2;
  const showAreaLabel = options.showAreaLabel !== false;
  const pad = dimensions
    ? Math.ceil(DIM_CLEAR_M * layout.scale + Math.max(DIM_LINE_GAP_M * layout.scale, DIM_CHAIN_GAP_PX) + 36)
    : Math.ceil(Math.max(12, PLAN_LINE * 12 + 14));
  const box = designExportBoundsPx(layout, rooms, pad) || { x: 0, y: 0, w: 640, h: 480 };
  if (showAreaLabel) {
    box.y -= 28;
    box.h += 28;
  }
  const width = Math.max(48, box.w);
  const height = Math.max(48, box.h);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("PNG capture failed");
  ctx.scale(scale, scale);
  ctx.translate(-box.x, -box.y);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(box.x, box.y, width, height);
  if (!bw && options.grid !== false) {
    drawMetreGrid(
      ctx,
      { x: box.x, y: box.y, w: width, h: height },
      layout.scale,
      layout.offsetX || 0,
      layout.offsetY || 0
    );
  }

  const innerMetres = insetPolygon(layout.metres, WALL_THICKNESS_M);
  const innerPts = innerMetres
    ? innerMetres.map((p) => ({
        x: p.x * layout.scale + layout.originX,
        y: p.y * layout.scale + layout.originY,
      }))
    : null;
  const exportInner = innerMetres || layout.metres;
  const exportWalls = bedroomBathroomInternalWalls(rooms, exportInner);
  const wallPx = Math.max(PLAN_LINE, WALL_THICKNESS_M * layout.scale);

  if (innerPts) {
    ctx.beginPath();
    tracePolygonPath(ctx, layout.pts);
    tracePolygonPath(ctx, innerPts);
    ctx.fillStyle = bw ? "#111111" : WALL_FILL;
    ctx.fill("evenodd");
  }

  if (!bw) {
    ctx.save();
    ctx.beginPath();
    tracePolygonPath(ctx, innerPts || layout.pts);
    for (const room of walledRooms(rooms)) {
      const r = roomToPx(room, layout);
      ctx.rect(r.x, r.y, r.w, r.h);
    }
    ctx.clip("evenodd");
    drawHybridPlanks(ctx, layout);
    ctx.restore();
  }

  ctx.lineJoin = "round";
  ctx.strokeStyle = bw ? "#111111" : WALL_FILL;
  ctx.lineWidth = PLAN_LINE;
  ctx.beginPath();
  tracePolygonPath(ctx, layout.pts);
  ctx.stroke();
  if (innerPts) {
    ctx.beginPath();
    tracePolygonPath(ctx, innerPts);
    ctx.stroke();
  }
  drawEaveCanvas(ctx, layout);

  for (const room of rooms || []) {
    const r = roomToPx(room, layout);
    if (isLivingSet(room) || hasCustomBench(room)) {
      drawExportRoomFixtures(ctx, room, layout, bw, innerMetres, exportWalls);
      continue;
    }
    if (bw) {
      if (!roomNeedsPartitionWalls(room) && roomKind(room) !== "kitchen" && roomKind(room) !== "porch") {
        ctx.strokeStyle = "#111111";
        ctx.lineWidth = PLAN_LINE;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
      }
    } else {
      const colors = roomColors(room);
      const kind = roomKind(room);
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = PLAN_LINE;
      if (kind === "bathroom") {
        ctx.fillStyle = colors.fill;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        drawBathroomTiles(ctx, room, layout);
      } else if (kind === "bedroom") {
        drawCarpetFloor(ctx, room, layout);
      } else if (kind === "porch") {
        // Deck parts are drawn with the porch fixtures.
      } else {
        ctx.save();
        ctx.beginPath();
        ctx.rect(r.x, r.y, r.w, r.h);
        ctx.clip();
        drawHybridPlanks(ctx, layout);
        ctx.restore();
      }
      if (kind !== "kitchen" && kind !== "porch") ctx.strokeRect(r.x, r.y, r.w, r.h);
    }
    drawExportRoomFixtures(ctx, room, layout, bw, innerMetres, exportWalls);
  }

  if (exportWalls.length) {
    ctx.strokeStyle = bw ? "#111111" : WALL_FILL;
    ctx.lineWidth = wallPx;
    ctx.lineCap = "butt";
    ctx.beginPath();
    for (const seg of exportWalls) {
      const px = wallSegToLayoutPx(seg, layout);
      ctx.moveTo(px.x1, px.y1);
      ctx.lineTo(px.x2, px.y2);
    }
    ctx.stroke();
    ctx.fillStyle = bw ? "#111111" : WALL_FILL;
    const half = wallPx / 2;
    for (const c of partitionWallCorners(exportWalls)) {
      const p = wallCornerToLayoutPx(c, layout);
      ctx.fillRect(p.x - half, p.y - half, wallPx, wallPx);
    }
    for (const room of rooms || []) {
      const door = roomDoorSwing(room, exportInner);
      if (door?.sliding) drawSlidingDoorCanvas(ctx, door, layout, bw);
    }
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '700 13px "Segoe UI", system-ui, sans-serif';
  const labelColor = "#111";
  const halo = bw ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.95)";
  const livingPt = innerMetres
    ? livingLabelPoint(innerMetres, walledRooms(rooms))
    : livingLabelPoint(layout.metres, walledRooms(rooms));
  const livingDims = innerMetres
    ? livingApproxDims(innerMetres, walledRooms(rooms))
    : livingApproxDims(layout.metres, walledRooms(rooms));
  if (livingPt) {
    const x = livingPt.x * layout.scale + layout.originX;
    const y = livingPt.y * layout.scale + layout.originY;
    drawHaloText(ctx, "Living", x, y - 8, labelColor, halo);
    if (livingDims) {
      ctx.font = '700 12px "Segoe UI", system-ui, sans-serif';
      drawHaloText(ctx, formatRoomDims(livingDims.w, livingDims.h), x, y + 8, labelColor, halo);
    }
  }

  ctx.font = '700 12px "Segoe UI", system-ui, sans-serif';
  for (const room of rooms || []) {
    if (isLivingSet(room)) continue;
    const r = roomToPx(room, layout);
    const x = r.x + r.w / 2;
    const y = r.y + r.h / 2;
    if (hasCustomBench(room)) {
      drawHaloText(ctx, roomKindLabel(roomKind(room)), x, y, labelColor, halo);
      continue;
    }
    drawHaloText(ctx, roomKindLabel(roomKind(room)), x, y - 8, labelColor, halo);
    drawHaloText(ctx, formatRoomDims(room.w, room.h), x, y + 8, labelColor, halo);
  }

  if (dimensions) {
    drawExportDimensionRuns(
      ctx,
      layout,
      rooms,
      innerMetres,
      exportWalls,
      bw ? "#111111" : MONUMENT
    );
  } else if (!bw) {
    ctx.font = '700 11px "Segoe UI", system-ui, sans-serif';
    for (const side of sideLengthLabels(layout.pts, true, layout.scale)) {
      ctx.save();
      ctx.translate(side.x, side.y);
      ctx.rotate(((side.angleDeg || 0) * Math.PI) / 180);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      drawHaloText(ctx, side.label, 0, 0, WHITE, "rgba(0,0,0,0.85)");
      ctx.restore();
    }
  }

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  if (showAreaLabel) {
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = '700 16px "Segoe UI", system-ui, sans-serif';
    drawHaloText(ctx, formatSqm(layout.areaM2), 12, 10, bw ? "#111" : MONUMENT, "rgba(255,255,255,0.95)");
  }
  return canvas;
}

function loadExportImage(src) {
  return new Promise((resolve, reject) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = src;
  });
}

function imageToPngDataUrl(img) {
  if (!img) return "";
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, img.naturalWidth || img.width);
  canvas.height = Math.max(1, img.naturalHeight || img.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("PDF capture failed");
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL("image/png");
}

function measureDataUrl(url) {
  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error("Preview image was empty"));
      return;
    }
    const img = new Image();
    img.onload = () => resolve({ url, w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
    img.onerror = () => reject(new Error("Preview image failed"));
    img.src = url;
  });
}

function rotatePngDataUrl(url, quarterTurns) {
  const turns = ((Number(quarterTurns) % 4) + 4) % 4;
  if (!url || turns === 0) return Promise.resolve(url || "");
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const swap = turns % 2 === 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, swap ? img.height : img.width);
      canvas.height = Math.max(1, swap ? img.width : img.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not rotate the preview image"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((turns * Math.PI) / 2);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Could not rotate the preview image"));
    img.src = url;
  });
}

function cropWhiteCanvas(source, threshold = 248) {
  const w = source?.width || 0;
  const h = source?.height || 0;
  if (!(w > 1) || !(h > 1)) return source;
  const ctx = source.getContext("2d");
  if (!ctx) return source;
  const pixels = ctx.getImageData(0, 0, w, h).data;
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      if (pixels[i + 3] < 8) continue;
      if (pixels[i] >= threshold && pixels[i + 1] >= threshold && pixels[i + 2] >= threshold) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX) return source;
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  if (cw >= w - 1 && ch >= h - 1) return source;
  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  const outCtx = out.getContext("2d");
  if (!outCtx) return source;
  outCtx.drawImage(source, minX, minY, cw, ch, 0, 0, cw, ch);
  return out;
}

function designSheetSpec() {
  const pageW = 210;
  const pageH = 297;
  const side = 10;
  const bottom = 10;
  const top = 5;
  const header = 30;
  const gap = 10;
  const inset = 5;
  const boxW = pageW - side * 2;
  const boxesTop = top + header;
  const boxH = (pageH - boxesTop - bottom - gap) / 2;
  return {
    pageW,
    pageH,
    side,
    bottom,
    top,
    header,
    gap,
    inset,
    boxW,
    boxH,
    boxesTop,
    innerAspect: (boxW - inset * 2) / Math.max(1, boxH - inset * 2),
  };
}

function designRoomCounts(rooms) {
  let beds = 0;
  let baths = 0;
  for (const room of rooms || []) {
    const kind = roomKind(room);
    if (kind === "bedroom") beds += 1;
    else if (kind === "bathroom") baths += 1;
  }
  return { beds, baths };
}

function countLabel(n, singular, plural) {
  const v = Math.max(0, Math.round(Number(n) || 0));
  return `${v} ${v === 1 ? singular : plural}`;
}

async function buildSheetPdf(planUrl, view3dUrl, details = {}) {
  const spec = designSheetSpec();
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, spec.pageW, spec.pageH, "F");

  const logo = await loadExportImage(sgfHomesLogo).catch(() => null);
  let textX = spec.side;
  if (logo) {
    const logoUrl = imageToPngDataUrl(logo);
    const ratio = (logo.naturalWidth || logo.width) / Math.max(1, logo.naturalHeight || logo.height);
    const logoH = 22;
    const logoW = Math.min(spec.boxW * 0.46, logoH * ratio);
    const logoY = spec.top + (spec.header - logoH) / 2;
    pdf.addImage(logoUrl, "PNG", spec.side, logoY, logoW, logoH);
    textX = spec.side + logoW + 6;
  }

  const { beds, baths } = designRoomCounts(details.rooms);
  const lines = [
    formatSqm(details.areaM2),
    countLabel(beds, "Bedroom", "Bedrooms"),
    countLabel(baths, "Bathroom", "Bathrooms"),
  ];
  const lineH = 6;
  const blockH = lineH * (lines.length - 1);
  const textTop = spec.top + (spec.header - blockH) / 2;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(17, 17, 17);
  lines.forEach((line, i) => pdf.text(line, textX, textTop + i * lineH));

  const topY = spec.boxesTop;
  const botY = spec.boxesTop + spec.boxH + spec.gap;
  placePngInBox(pdf, planUrl || "", spec.side, topY, spec.boxW, spec.boxH, spec.inset);
  placePngInBox(pdf, view3dUrl || "", spec.side, botY, spec.boxW, spec.boxH, spec.inset);
  pdf.setDrawColor(50, 50, 51);
  pdf.setLineWidth(0.4);
  pdf.rect(spec.side, topY, spec.boxW, spec.boxH);
  pdf.rect(spec.side, botY, spec.boxW, spec.boxH);
  return pdf;
}

function designPdfFilename(areaM2) {
  const n =
    !(areaM2 > 0) ? "0" : areaM2 >= 100 ? areaM2.toFixed(0) : areaM2 >= 10 ? areaM2.toFixed(1) : areaM2.toFixed(2);
  return `quick-concept-${n}m2.pdf`;
}

const PDF_MARGIN_MM = 10;
const PDF_BOX_GAP_MM = 15;
const PDF_BOX_INSET_MM = 15;
const PDF_LOGO_H_MM = 34;
const PDF_PAGE_W_MM = 210;
const PDF_PAGE_H_MM = 297;

function measureDesignPdf(address, sizeLabel) {
  const probe = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = PDF_MARGIN_MM;
  const boxGap = PDF_BOX_GAP_MM;
  const logoH = PDF_LOGO_H_MM;
  const pageW = PDF_PAGE_W_MM;
  const pageH = PDF_PAGE_H_MM;
  const contentW = pageW - margin * 2;
  const inset = PDF_BOX_INSET_MM;
  probe.setFont("helvetica", "bold");
  probe.setFontSize(13);
  const addressLines = probe.splitTextToSize(String(address || "—"), contentW);
  const sizeLines = probe.splitTextToSize(String(sizeLabel || "—"), contentW);
  const lineH = 6;
  let y = margin + logoH + 8;
  y += 6;
  y += addressLines.length * lineH + 4;
  y += 6;
  y += sizeLines.length * lineH + 6;
  const leftover = pageH - y - margin;
  const boxH = Math.max(36, (leftover - boxGap) / 2);
  return {
    margin,
    boxGap,
    logoH,
    pageW,
    pageH,
    contentW,
    addressLines,
    sizeLines,
    lineH,
    boxH,
    boxY0: y,
    boxY1: y + boxH + boxGap,
    inset,
    innerW: contentW - inset * 2,
    innerH: boxH - inset * 2,
  };
}

function placePngInBox(pdf, dataUrl, boxX, boxY, boxW, boxH, inset = PDF_BOX_INSET_MM) {
  if (!dataUrl) return;
  const innerX = boxX + inset;
  const innerY = boxY + inset;
  const innerW = Math.max(1, boxW - inset * 2);
  const innerH = Math.max(1, boxH - inset * 2);
  let imgW = 0;
  let imgH = 0;
  try {
    const props = pdf.getImageProperties(dataUrl);
    imgW = props.width;
    imgH = props.height;
  } catch {
    return;
  }
  if (!(imgW > 0) || !(imgH > 0)) return;
  const scale = Math.min(innerW / imgW, innerH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  pdf.addImage(dataUrl, "PNG", innerX + (innerW - w) / 2, innerY + (innerH - h) / 2, w, h);
}

async function buildDesignDownloadPdf({
  planCanvas,
  view3dUrl,
  logoSrc,
  address,
  sizeLabel,
}) {
  const spec = measureDesignPdf(address, sizeLabel);
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  const { margin, contentW, logoH, boxH, boxY0, boxY1, addressLines, sizeLines, lineH } = spec;
  const [logo, view3d] = await Promise.all([
    loadExportImage(logoSrc).catch(() => null),
    loadExportImage(view3dUrl).catch(() => null),
  ]);

  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, spec.pageW, spec.pageH, "F");

  let y = margin;
  if (logo) {
    const logoUrl = imageToPngDataUrl(logo);
    const ratio = (logo.naturalWidth || logo.width) / Math.max(1, logo.naturalHeight || logo.height);
    const logoW = Math.min(contentW, logoH * ratio);
    pdf.addImage(logoUrl, "PNG", margin, y, logoW, logoH);
  }
  y += logoH + 8;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(107, 107, 107);
  pdf.text("PROJECT ADDRESS", margin, y);
  y += 6;
  pdf.setFontSize(13);
  pdf.setTextColor(17, 17, 17);
  pdf.text(addressLines, margin, y);
  y += addressLines.length * lineH + 4;
  pdf.setFontSize(8);
  pdf.setTextColor(107, 107, 107);
  pdf.text("UNIT SIZE", margin, y);
  y += 6;
  pdf.setFontSize(13);
  pdf.setTextColor(17, 17, 17);
  pdf.text(sizeLines, margin, y);

  const viewUrl = view3d ? imageToPngDataUrl(view3d) : "";
  placePngInBox(pdf, viewUrl, margin, boxY0, contentW, boxH);
  pdf.setDrawColor(50, 50, 51);
  pdf.setLineWidth(0.35);
  pdf.rect(margin, boxY0, contentW, boxH, "S");

  const planUrl = planCanvas?.toDataURL?.("image/png") || "";
  placePngInBox(pdf, planUrl, margin, boxY1, contentW, boxH);
  pdf.rect(margin, boxY1, contentW, boxH, "S");

  return pdf;
}

function waitForDesignCapture(captureRef, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      const fn = captureRef?.current;
      if (typeof fn === "function") {
        resolve(fn);
        return;
      }
      if (Date.now() - t0 > timeoutMs) {
        reject(new Error("3D preview was not ready"));
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

async function createDesignPdfBlob({
  layout,
  rooms,
  address,
  capture3d,
}) {
  const planCanvas = buildDesignExportCanvas(layout, rooms, {
    mode: "bw",
    dimensions: true,
    scale: 2,
    showAreaLabel: false,
  });
  const view3dUrl = typeof capture3d === "function" ? capture3d(2200) || "" : "";
  const pdf = await buildDesignDownloadPdf({
    planCanvas,
    view3dUrl,
    logoSrc: sgfHomesLogo,
    address: address || "",
    sizeLabel: formatSqm(layout.areaM2),
  });
  return {
    blob: pdf.output("blob"),
    filename: designPdfFilename(layout.areaM2),
  };
}


function SendConceptClientModal({
  address,
  quoteEmail,
  quoteFirstName,
  metres,
  rooms,
  eaveDepths,
  walkStart,
  walkStops,
  walkFinish,
  onClose,
}) {
  const { runWithEmailOverlay } = useEmailSendOverlay();
  const [to, setTo] = useState(() => String(quoteEmail || "").trim());
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setTo(String(quoteEmail || "").trim());
  }, [quoteEmail]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const fieldStyle = {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 10px",
    fontSize: 13,
    fontFamily: "inherit",
    border: `1px solid ${EXPLORER_BORDER}`,
    borderRadius: 8,
    background: WHITE,
    color: MONUMENT,
  };

  const send = async () => {
    const recipient = String(to || "").trim();
    if (!recipient) {
      setError("Enter an email address.");
      return;
    }
    if (!metres || metres.length < 3) {
      setError("Draw the design before sending it.");
      return;
    }
    setError("");
    setSending(true);
    try {
      const inner = insetPolygon(metres, WALL_THICKNESS_M) || metres;
      const start = walkStart || defaultWalkStartMetres(rooms, metres, inner);
      const snapshot = {
        address: address || "",
        metres,
        rooms,
        eaveDepths: normalizeEaveDepths(eaveDepths, metres.length),
        walk: {
          start: start ? { x: start.x, y: start.y } : null,
          stops: (walkStops || []).map((stop) => ({
            kind: stop.kind === "point" ? "point" : "location",
            x: stop.x,
            y: stop.y,
          })),
          finish: walkFinish ? { x: walkFinish.x, y: walkFinish.y } : null,
        },
      };
      await runWithEmailOverlay(async () => {
        const res = await fetch("/api/quick-concept/client-view", {
          method: "POST",
          credentials: "include",
          headers: getApiHeaders(),
          body: JSON.stringify({
            email: recipient,
            firstName: quoteFirstName || "",
            snapshot,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not send the email.");
      });
      onClose();
    } catch (err) {
      setError(err.message || "Could not send the email.");
    } finally {
      setSending(false);
    }
  };

  return (
    <ModalBackdrop
      zIndex={21000}
      style={{
        background: "rgba(0,0,0,0.55)",
        padding: 24,
        overflow: "auto",
        alignItems: "flex-start",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(480px, 100%)",
          margin: "40px auto",
          background: WHITE,
          borderRadius: 12,
          boxShadow: "0 12px 40px rgba(0,0,0,0.28)",
          padding: 22,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: MONUMENT, marginBottom: 8 }}>Send to client</div>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 16, lineHeight: 1.45 }}>
          They receive a one-time link to the plan, a 3D view they can turn, and the walk through.
        </div>
        <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 16 }}>
          Email
          <input
            type="email"
            value={to}
            autoFocus
            onChange={(event) => {
              setTo(event.target.value);
              if (error) setError("");
            }}
            placeholder="client@email.com"
            style={{ ...fieldStyle, marginTop: 4 }}
          />
        </label>
        {error ? <div style={{ color: "#c00", fontSize: 13, marginBottom: 12 }}>{error}</div> : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} disabled={sending} style={toolbarButtonStyle(!sending)}>
            Cancel
          </button>
          <button type="button" onClick={() => void send()} disabled={sending} style={toolbarButtonStyle(!sending)}>
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

function DesignEmailModal({ layout, rooms, address, quoteEmail, quoteFirstName, onClose }) {
  const { runWithEmailOverlay } = useEmailSendOverlay();
  const captureRef = useRef(null);
  const [to, setTo] = useState(() => String(quoteEmail || "").trim());
  const [error, setError] = useState("");
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfReady, setPdfReady] = useState(false);
  const firstName = String(quoteFirstName || "").trim();
  const subject = `QUOTE - ${String(address || "").trim()}`;
  const body = firstName ? `Hi ${firstName}` : "Hi";
  const metres = layout?.metres;
  const innerMetres = useMemo(
    () => (metres ? insetPolygon(metres, WALL_THICKNESS_M) : null),
    [metres]
  );
  const exportWalls = useMemo(
    () => bedroomBathroomInternalWalls(rooms, innerMetres || metres),
    [rooms, innerMetres, metres]
  );
  const planDoors = useMemo(
    () => collectDesignDoors(rooms, metres, innerMetres || metres),
    [rooms, metres, innerMetres]
  );

  useEffect(() => {
    setTo(String(quoteEmail || "").trim());
  }, [quoteEmail]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  useEffect(() => {
    if (!layout) return undefined;
    let cancelled = false;
    setPdfFile(null);
    setPdfReady(false);
    (async () => {
      try {
        const capture3d = await waitForDesignCapture(captureRef);
        if (cancelled) return;
        const { blob, filename } = await createDesignPdfBlob({
          layout,
          rooms,
          address,
          capture3d,
        });
        if (cancelled) return;
        setPdfFile(new File([blob], filename, { type: "application/pdf" }));
        setPdfReady(true);
        setError("");
      } catch (err) {
        if (cancelled) return;
        console.error("[QuickConcept] email PDF failed:", err);
        setError(err.message || "Could not create the PDF attachment.");
        setPdfReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [layout, rooms, address]);

  const fieldStyle = {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 10px",
    fontSize: 13,
    fontFamily: "inherit",
    border: `1px solid ${EXPLORER_BORDER}`,
    borderRadius: 8,
    background: WHITE,
    color: MONUMENT,
  };

  const send = async () => {
    const recipient = String(to || "").trim();
    if (!recipient) {
      setError("Enter a recipient email.");
      return;
    }
    if (!pdfFile) {
      setError("The PDF is still being created.");
      return;
    }
    setError("");
    try {
      await runWithEmailOverlay(async () => {
        const form = new FormData();
        form.append("to", recipient);
        form.append("from", QUOTE_EMAIL_FROM);
        form.append("subject", subject);
        form.append("htmlBody", body.replace(/\n/g, "<br>"));
        form.append("attachment", pdfFile, pdfFile.name);
        const headers = getApiHeaders();
        delete headers["Content-Type"];
        const res = await fetch("/api/emails/send", {
          method: "POST",
          credentials: "include",
          headers,
          body: form,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      });
      onClose();
    } catch (err) {
      setError(err.message || "Send failed");
    }
  };

  return (
    <ModalBackdrop
      zIndex={21000}
      style={{
        background: "rgba(0,0,0,0.55)",
        padding: 24,
        overflow: "auto",
        alignItems: "flex-start",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          margin: "40px auto",
          background: WHITE,
          borderRadius: 12,
          boxShadow: "0 12px 40px rgba(0,0,0,0.28)",
          padding: 22,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: MONUMENT, marginBottom: 16 }}>Email</div>
        <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 12 }}>
          To
          <input
            type="email"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              if (error) setError("");
            }}
            placeholder="client@email.com"
            style={{ ...fieldStyle, marginTop: 4 }}
          />
        </label>
        <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 12 }}>
          From
          <input
            type="text"
            value={QUOTE_EMAIL_FROM}
            readOnly
            style={{ ...fieldStyle, marginTop: 4, background: "#f4f4f4" }}
          />
        </label>
        <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 12 }}>
          Subject
          <input
            type="text"
            value={subject}
            readOnly
            style={{ ...fieldStyle, marginTop: 4, background: "#f4f4f4" }}
          />
        </label>
        <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 16 }}>
          Body
          <textarea
            value={body}
            readOnly
            rows={4}
            style={{ ...fieldStyle, marginTop: 4, background: "#f4f4f4", resize: "vertical", minHeight: 88 }}
          />
        </label>
        <div style={{ fontSize: 12, color: "#555", marginBottom: 16 }}>
          Attachment
          <div
            style={{
              ...fieldStyle,
              marginTop: 4,
              background: "#f4f4f4",
              color: pdfReady ? MONUMENT : "#777",
            }}
          >
            {pdfReady && pdfFile ? pdfFile.name : "Creating PDF…"}
          </div>
        </div>
        {error ? (
          <div style={{ color: "#c00", fontSize: 13, marginBottom: 12 }}>{error}</div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} style={toolbarButtonStyle(true)}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={!pdfReady || !pdfFile}
            style={toolbarButtonStyle(pdfReady && Boolean(pdfFile))}
          >
            Send
          </button>
        </div>
      </div>
      {layout ? (
        <div
          aria-hidden
          style={{
            position: "fixed",
            right: 0,
            bottom: 0,
            width: 640,
            height: 640,
            overflow: "hidden",
            pointerEvents: "none",
            opacity: 0.01,
            zIndex: 0,
          }}
        >
          <QuickConcept3DPreview
            metres={layout.metres}
            rooms={roomsWithPorchSteps(rooms, layout.metres)}
            innerMetres={innerMetres}
            walls={exportWalls}
            doors={planDoors}
            captureRef={captureRef}
          />
        </div>
      ) : null}
    </ModalBackdrop>
  );
}

function sheetPct(part, total) {
  return `${(part / total) * 100}%`;
}

function PreviewRotateImage({ src, width, height, quarter }) {
  const frameRef = useRef(null);
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    const measure = () => setFrame({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const turns = ((quarter % 4) + 4) % 4;
  const swap = turns % 2 === 1;
  const srcW = swap ? height : width;
  const srcH = swap ? width : height;
  const scale =
    frame.w > 0 && frame.h > 0 && srcW > 0 && srcH > 0 ? Math.min(frame.w / srcW, frame.h / srcH) : 0;
  return (
    <div ref={frameRef} style={{ position: "absolute", inset: 0 }}>
      {scale > 0 ? (
        <img
          alt=""
          draggable={false}
          src={src}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: width * scale,
            height: height * scale,
            transform: `translate(-50%, -50%) rotate(${turns * 90}deg)`,
            transformOrigin: "center center",
          }}
        />
      ) : null}
    </div>
  );
}

function PreviewSheetBox({ image, quarter, onRotate, label }) {
  const spec = designSheetSpec();
  const degrees = ((quarter % 4) + 4) % 4 * 90;
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        border: "1px solid #323233",
        boxSizing: "border-box",
        background: "#ffffff",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: sheetPct(spec.inset, spec.boxW),
          right: sheetPct(spec.inset, spec.boxW),
          top: sheetPct(spec.inset, spec.boxH),
          bottom: sheetPct(spec.inset, spec.boxH),
        }}
      >
        {image ? (
          <PreviewRotateImage src={image.url} width={image.w} height={image.h} quarter={quarter} />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#6b6b6b",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            Preparing…
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onRotate}
        disabled={!image}
        aria-label={`Rotate ${label}, currently ${degrees} degrees`}
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          zIndex: 2,
          background: "rgba(255,255,255,0.94)",
          color: MONUMENT,
          border: "1px solid #323233",
          borderRadius: "8px",
          padding: "4px 8px",
          fontSize: "12px",
          fontWeight: 700,
          cursor: image ? "pointer" : "not-allowed",
          opacity: image ? 1 : 0.45,
        }}
      >
        Rotate {degrees}°
      </button>
    </div>
  );
}

function DesignPdfPreviewModal({
  preview,
  areaM2,
  rooms,
  planQuarter,
  viewQuarter,
  onRotatePlan,
  onRotateView,
  onGenerate,
  onClose,
  generating,
}) {
  const spec = designSheetSpec();
  const { beds, baths } = designRoomCounts(rooms);
  const ready = preview?.status === "ready";
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || generating) return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [generating, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="PDF preview"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10250,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "12px 16px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          height: "100%",
          width: "100%",
          minHeight: 0,
        }}
      >
        <div
          style={{
            position: "relative",
            width: "min(calc((100dvh - 92px) * 210 / 297), calc(100vw - 32px))",
            maxHeight: "calc(100dvh - 92px)",
            aspectRatio: `${spec.pageW} / ${spec.pageH}`,
            flex: "0 1 auto",
            background: "#ffffff",
            boxShadow: "0 12px 40px rgba(0,0,0,0.28)",
            containerType: "inline-size",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: sheetPct(spec.side, spec.pageW),
              right: sheetPct(spec.side, spec.pageW),
              top: sheetPct(spec.top, spec.pageH),
              height: sheetPct(spec.header, spec.pageH),
              display: "flex",
              alignItems: "center",
              gap: "4cqw",
            }}
          >
            <img
              alt="SGF Homes"
              src={sgfHomesLogo}
              style={{ height: "73%", width: "auto", objectFit: "contain" }}
            />
            <div style={{ fontWeight: 700, color: "#111111", fontSize: "2.15cqw", lineHeight: 1.25 }}>
              <div>{formatSqm(areaM2)}</div>
              <div>{countLabel(beds, "Bedroom", "Bedrooms")}</div>
              <div>{countLabel(baths, "Bathroom", "Bathrooms")}</div>
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              left: sheetPct(spec.side, spec.pageW),
              width: sheetPct(spec.boxW, spec.pageW),
              top: sheetPct(spec.boxesTop, spec.pageH),
              height: sheetPct(spec.boxH, spec.pageH),
            }}
          >
            <PreviewSheetBox
              image={preview?.plan}
              quarter={planQuarter}
              onRotate={onRotatePlan}
              label="plan"
            />
          </div>
          <div
            style={{
              position: "absolute",
              left: sheetPct(spec.side, spec.pageW),
              width: sheetPct(spec.boxW, spec.pageW),
              top: sheetPct(spec.boxesTop + spec.boxH + spec.gap, spec.pageH),
              height: sheetPct(spec.boxH, spec.pageH),
            }}
          >
            <PreviewSheetBox
              image={preview?.view}
              quarter={viewQuarter}
              onRotate={onRotateView}
              label="3D view"
            />
          </div>
          {preview?.status === "error" ? (
            <div
              style={{
                position: "absolute",
                inset: "18% 8%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                color: "#111",
                fontWeight: 600,
                background: "rgba(255,255,255,0.92)",
              }}
            >
              {preview.error || "Could not prepare the preview."}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", flexShrink: 0 }}>
          <button type="button" onClick={onClose} disabled={generating} style={toolbarButtonStyle(!generating)}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onGenerate}
            disabled={!ready || generating}
            style={{
              ...toolbarButtonStyle(ready && !generating),
              background: ready && !generating ? MONUMENT : WHITE,
              color: ready && !generating ? WHITE : MONUMENT,
              border: `1px solid ${MONUMENT}`,
            }}
          >
            {generating ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel = "Delete", onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel, onConfirm]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qc-delete-title"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10100,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "min(380px, calc(100vw - 40px))",
          background: "#ffffff",
          borderRadius: "16px",
          border: `1px solid ${EXPLORER_BORDER}`,
          boxShadow: "0 12px 40px rgba(0,0,0,0.28)",
          padding: "20px 22px 16px",
          boxSizing: "border-box",
        }}
      >
        <h2
          id="qc-delete-title"
          style={{ margin: "0 0 10px", fontSize: "1.15rem", fontWeight: 700, color: MONUMENT }}
        >
          {title}
        </h2>
        <p style={{ margin: "0 0 18px", fontSize: "0.95rem", color: "#555", lineHeight: 1.4 }}>
          {message}
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" onClick={onCancel} style={toolbarButtonStyle(true)} autoFocus>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              ...toolbarButtonStyle(true),
              background: "#b3261e",
              color: WHITE,
              border: "1px solid #b3261e",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Design3DModal({
  layout,
  rooms,
  walkRoute = null,
  onAddLocation,
  onAddPoint,
  onAddFinish,
  onClearWalk,
  onClose,
}) {
  const walkRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const metres = layout?.metres;
  const previewRooms = useMemo(() => roomsWithPorchSteps(rooms, metres), [rooms, metres]);
  const innerMetres = useMemo(
    () => (metres ? insetPolygon(metres, WALL_THICKNESS_M) : null),
    [metres]
  );
  const exportWalls = useMemo(
    () => bedroomBathroomInternalWalls(rooms, innerMetres || metres),
    [rooms, innerMetres, metres]
  );
  const planDoors = useMemo(
    () => collectDesignDoors(rooms, metres, innerMetres || metres),
    [rooms, metres, innerMetres]
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qc-3d-title"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10100,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "min(1600px, calc(100vw - 48px), calc((100vh - 190px) * 4 / 3))",
          background: "#ffffff",
          borderRadius: "16px",
          border: `1px solid ${EXPLORER_BORDER}`,
          boxShadow: "0 12px 40px rgba(0,0,0,0.28)",
          padding: "20px 22px 16px",
          boxSizing: "border-box",
        }}
      >
        <h2
          id="qc-3d-title"
          style={{ margin: "0 0 14px", fontSize: "1.15rem", fontWeight: 700, color: MONUMENT }}
        >
          3D view
        </h2>
        <div
          style={{
            background: "#fff",
            border: `1px solid ${EXPLORER_BORDER}`,
            borderRadius: "10px",
            width: "100%",
            aspectRatio: "4 / 3",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div style={{ position: "absolute", inset: 0 }}>
            <QuickConcept3DPreview
              metres={layout.metres}
              rooms={previewRooms}
              innerMetres={innerMetres}
              walls={exportWalls}
              doors={planDoors}
              walkRef={walkRef}
              walkRoute={walkRoute}
            />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", marginTop: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                walkRef.current?.();
              }}
              style={{ ...toolbarButtonStyle(true), position: "relative", zIndex: 2 }}
            >
              Walk through
            </button>
            <button type="button" onClick={onAddLocation} style={toolbarButtonStyle(true)}>
              Add location
            </button>
            <button type="button" onClick={onAddPoint} style={toolbarButtonStyle(true)}>
              Add point
            </button>
            <button
              type="button"
              onClick={onAddFinish}
              disabled={Boolean(walkRoute?.finish)}
              style={toolbarButtonStyle(!walkRoute?.finish)}
            >
              Add finish
            </button>
            <button type="button" onClick={onClearWalk} style={toolbarButtonStyle(true)}>
              Clear
            </button>
          </div>
          <button type="button" onClick={onClose} style={toolbarButtonStyle(true)} autoFocus>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function formatMetres(m) {
  const v = Number.isFinite(m) ? Math.max(0, m) : 0;
  return snapMetresToStep(v, BUILDING_STEP_M).toFixed(1);
}

function formatPlanMm(m) {
  return String(Math.round(Math.max(0, m) * 1000));
}

function formatDimMm(m) {
  const v = snapMetresToStep(Math.max(0, Number(m) || 0), BUILDING_STEP_M);
  return String(Math.round(v * 1000));
}

function sideLengthLabels(pts, closed, ppm, options = {}) {
  if (!pts || pts.length < 2 || !(ppm > 0)) return [];
  const n = pts.length;
  const count = closed ? n : n - 1;
  const outsetPx = options.outsetPx > 0 ? options.outsetPx : 14;
  const clearPx = options.clearPx > 0 ? options.clearPx : outsetPx;
  const foot = options.footprintPx;
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const lenPx = Math.hypot(b.x - a.x, b.y - a.y);
    if (lenPx < 8) continue;
    const inward = polygonEdgeInwardNormal(pts, a, b);
    const nx = -inward.nx;
    const ny = -inward.ny;
    const mx = inward.mx;
    const my = inward.my;
    let x = mx + nx * outsetPx;
    let y = my + ny * outsetPx;
    if (foot) {
      if (nx < -0.5) x = Math.min(x, foot.minX - clearPx);
      else if (nx > 0.5) x = Math.max(x, foot.maxX + clearPx);
      if (ny < -0.5) y = Math.min(y, foot.minY - clearPx);
      else if (ny > 0.5) y = Math.max(y, foot.maxY + clearPx);
    }
    out.push({
      key: `side-${i}`,
      x,
      y,
      label: formatMetres(lenPx / ppm),
      angleDeg: (() => {
        let angle = Math.atan2(b.y - a.y, b.x - a.x);
        if (angle > Math.PI / 2) angle -= Math.PI;
        if (angle < -Math.PI / 2) angle += Math.PI;
        return (angle * 180) / Math.PI;
      })(),
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

function polygonSignedAreaXY(pts) {
  let sum = 0;
  const n = pts?.length || 0;
  for (let i = 0; i < n; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum;
}

function polygonAreaM2(pts, ppm = DEFAULT_PPM) {
  if (!pts || pts.length < 3) return 0;
  return Math.abs(polygonSignedAreaXY(pts)) / 2 / (ppm * ppm);
}

/** Inward unit normal for an edge. Uses winding so concave L-corners stay correct. */
function polygonEdgeInwardNormal(pts, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ccw = polygonSignedAreaXY(pts) >= 0;
  return {
    nx: (ccw ? -dy : dy) / len,
    ny: (ccw ? dx : -dx) / len,
    mx: (a.x + b.x) / 2,
    my: (a.y + b.y) / 2,
  };
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
  const desiredArea = polygonAreaM2(desired, ppm);
  if (desiredArea <= maxM2 + 1e-9) return desired;
  const start = baseVerts[index];
  const startArea = polygonAreaM2(baseVerts, ppm);
  // Oversized outline (drawn at Any size, then Max 60 m² turned on): allow
  // shrinking with the cursor, but never grow. Once the live outline is at or
  // under the cap, the branch below stops the wall at maxM2.
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

function keepMovedUnderArea(moved, capped, maxM2, ppm = DEFAULT_PPM) {
  if (!(maxM2 > 0) || polygonAreaM2(moved, ppm) <= maxM2 + 1e-9) return moved;
  if (capped && polygonAreaM2(capped, ppm) <= maxM2 + 1e-9) return capped;
  return moved;
}

const BUILDING_STEP_M = 0.1;

function snapMetresToStep(m, step = BUILDING_STEP_M) {
  if (!(step > 0) || !Number.isFinite(m)) return m;
  const stepMm = Math.round(step * 1000);
  const mm = Math.round(m * 1000);
  return (Math.round(mm / stepMm) * stepMm) / 1000;
}

function snapToBuildingStep(value, ref, step = BUILDING_STEP_M) {
  if (!(step > 0) || !Number.isFinite(value) || !Number.isFinite(ref)) return value;
  const dist = value - ref;
  const sign = dist < 0 ? -1 : 1;
  const stepMm = step * 1000;
  const useMm = Math.abs(stepMm - Math.round(stepMm)) < 1e-6 && stepMm >= 1 && stepMm <= 1000;
  if (useMm) {
    const sMm = Math.round(stepMm);
    const dMm = Math.round(Math.abs(dist) * 1000);
    const magMm = Math.max(sMm, Math.round(dMm / sMm) * sMm);
    return ref + sign * (magMm / 1000);
  }
  const units = Math.round(Math.abs(dist) / step);
  return ref + sign * Math.max(1, units) * step;
}

function snapPixelAxis(delta, stepPx, mode = "round") {
  const mag = Math.abs(delta);
  if (!(stepPx > 0)) return mag;
  const units =
    mode === "floor" ? Math.floor(mag / stepPx + 1e-6) : Math.round(mag / stepPx);
  if (units < 1) return mode === "floor" ? mag : stepPx;
  return units * stepPx;
}

/** Snap a map point so its offset from origin is a 100 mm multiple along the current direction. */
function snapPixelLengthFrom(origin, point, stepPx, mode = "round") {
  if (!origin || !point || !(stepPx > 0)) return point;
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { x: point.x, y: point.y };
  const mag = snapPixelAxis(len, stepPx, mode);
  return { x: origin.x + (dx / len) * mag, y: origin.y + (dy / len) * mag };
}

/** Snap a map rectangle corner so width and height are 100 mm multiples. */
function snapPixelRectFrom(origin, point, stepPx, mode = "round") {
  if (!origin || !point || !(stepPx > 0)) return point;
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const sx = dx < 0 ? -1 : 1;
  const sy = dy < 0 ? -1 : 1;
  return {
    x: origin.x + sx * snapPixelAxis(dx, stepPx, mode),
    y: origin.y + sy * snapPixelAxis(dy, stepPx, mode),
  };
}

function clampRectFromPointsStepped(start, end, maxM2, ppm = DEFAULT_PPM, stepM = BUILDING_STEP_M) {
  const stepPx = stepM * ppm;
  const snappedEnd = snapPixelRectFrom(start, end, stepPx);
  const limited = clampRectFromPoints(start, snappedEnd, maxM2, ppm);
  const limitedEnd = {
    x: snappedEnd.x >= start.x ? start.x + limited.w : start.x - limited.w,
    y: snappedEnd.y >= start.y ? start.y + limited.h : start.y - limited.h,
  };
  const sameSize =
    Math.abs(limited.w - Math.abs(snappedEnd.x - start.x)) < 0.5 &&
    Math.abs(limited.h - Math.abs(snappedEnd.y - start.y)) < 0.5;
  if (sameSize) return limited;
  return rectFromPoints(start, snapPixelRectFrom(start, limitedEnd, stepPx, "floor"));
}

/** Keep building-edge drags on 100 mm (0.1 m) size steps. */
function snapBuildingEdgeToStep(baseVerts, moved, index, step = BUILDING_STEP_M) {
  const n = moved?.length || 0;
  if (n < 2 || !(step > 0)) return moved;
  const i1 = (index + 1) % n;
  const a0 = baseVerts[index];
  const b0 = baseVerts[i1];
  const a1 = moved[index];
  const b1 = moved[i1];
  if (!a0 || !b0 || !a1 || !b1) return moved;
  const out = moved.map((p) => ({ x: p.x, y: p.y }));
  const axis = edgeAxis(a0, b0);
  const prev = baseVerts[(index - 1 + n) % n];
  const next = baseVerts[(i1 + 1) % n];
  if (axis === "h") {
    const refY =
      Math.abs((prev?.y ?? a0.y) - a0.y) >= Math.abs((next?.y ?? b0.y) - b0.y)
        ? prev.y
        : next.y;
    const y = snapToBuildingStep(a1.y, refY, step);
    out[index] = { x: a1.x, y };
    out[i1] = { x: b1.x, y };
    return out;
  }
  const refX =
    Math.abs((prev?.x ?? a0.x) - a0.x) >= Math.abs((next?.x ?? b0.x) - b0.x)
      ? prev.x
      : next.x;
  const x = snapToBuildingStep(a1.x, refX, step);
  out[index] = { x, y: a1.y };
  out[i1] = { x, y: b1.y };
  return out;
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
  return `${formatDimMm(w)} × ${formatDimMm(h)}`;
}

function formatRoomMetres(w, h) {
  return `${formatMetres(w)} × ${formatMetres(h)}`;
}

function RoomDimLabel({ x, y, text, title, subtitle }) {
  const top = title || null;
  const bottom = subtitle || (!title ? text : null) || null;
  return (
    <span
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: "translate(-50%, -50%)",
        color: "#111",
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
        pointerEvents: "none",
        textShadow: "0 0 4px #fff, 0 0 4px #fff, 0 1px 2px rgba(255,255,255,0.9)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        lineHeight: 1.15,
      }}
    >
      {top ? (
        <span style={{ fontSize: "0.72rem", fontWeight: 700 }}>{top}</span>
      ) : null}
      {bottom ? (
        <span style={{ fontSize: top ? "0.65rem" : "0.7rem", fontWeight: 700 }}>{bottom}</span>
      ) : null}
    </span>
  );
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

function EdgeDimLabel({ x, y, text, angleDeg = 0, color = "#111" }) {
  const light = color === WHITE || color === "#fff" || color === "#ffffff";
  return (
    <span
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%, -50%) rotate(${angleDeg}deg)`,
        color,
        fontSize: "0.72rem",
        fontWeight: 700,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
        pointerEvents: "none",
        textShadow: light
          ? "0 0 4px #000, 0 0 5px #000, 0 1px 2px rgba(0,0,0,0.9)"
          : "0 0 4px #fff, 0 0 4px #fff, 0 1px 2px rgba(255,255,255,0.9)",
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

function liveDesignFrame(pixelVerts, ppm, stored) {
  if (!pixelVerts || pixelVerts.length < 3 || !(ppm > 0)) return stored || null;
  const unrotated = pixelVerts.map((p) => ({ x: p.x / ppm, y: p.y / ppm }));
  const centroid = polygonCentroid(unrotated);
  const angle = stored ? null : longestSideAngle(unrotated);
  const cosF = stored?.cosF ?? Math.cos(-angle);
  const sinF = stored?.sinF ?? Math.sin(-angle);
  return {
    metres: rotateAbout(unrotated, centroid, cosF, sinF),
    centroid,
    cosF,
    sinF,
    srcPpm: ppm,
  };
}

function roomCornersMetres(room) {
  return [
    { x: room.x, y: room.y },
    { x: room.x + room.w, y: room.y },
    { x: room.x + room.w, y: room.y + room.h },
    { x: room.x, y: room.y + room.h },
  ];
}

function pixelsToDesignMetres(pixelVerts, frame) {
  const { centroid: c, cosF, sinF, srcPpm } = frame;
  return pixelVerts.map((p) => {
    const dx = p.x / srcPpm - c.x;
    const dy = p.y / srcPpm - c.y;
    return {
      x: c.x + dx * cosF - dy * sinF,
      y: c.y + dx * sinF + dy * cosF,
    };
  });
}

function remapRoomToFrame(room, fromFrame, toFrame) {
  if (!fromFrame || !toFrame || fromFrame === toFrame) return room;
  const metres = pixelsToDesignMetres(
    designMetresToPixels(roomCornersMetres(room), fromFrame),
    toFrame
  );
  const xs = metres.map((p) => p.x);
  const ys = metres.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    ...room,
    x,
    y,
    w: Math.max(...xs) - x,
    h: Math.max(...ys) - y,
  };
}

function roomToMapPixels(room, frame) {
  if (!frame) return [];
  return designMetresToPixels(roomCornersMetres(room), frame);
}

function polygonCentroidPx(pts) {
  if (!pts?.length) return { x: 0, y: 0 };
  const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return { x, y };
}

function livingHolesPathD(outlinePts, holePolys) {
  if (!outlinePts?.length) return "";
  const parts = [polygonPathD(outlinePts)];
  for (const hole of holePolys || []) {
    if (!hole?.length) continue;
    parts.push(
      `M ${hole[0].x} ${hole[0].y} ${hole
        .slice(1)
        .map((p) => `L ${p.x} ${p.y}`)
        .join(" ")} Z`
    );
  }
  return parts.join(" ");
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

function layoutFromMetres(metres, width, height, lockedScale = null, includePoint = null, tightPoints = null) {
  const EDGE = 28;
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
  const bMinX = minX;
  const bMinY = minY;
  const includeList = !includePoint ? [] : Array.isArray(includePoint) ? includePoint : [includePoint];
  if (includeList.length) {
    const pad = 2.2;
    for (const p of includeList) {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      minX = Math.min(minX, p.x - pad);
      minY = Math.min(minY, p.y - pad);
      maxX = Math.max(maxX, p.x + pad);
      maxY = Math.max(maxY, p.y + pad);
    }
  }
  for (const p of tightPoints || []) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    minX = Math.min(minX, p.x - 0.35);
    minY = Math.min(minY, p.y - 0.35);
    maxX = Math.max(maxX, p.x + 0.35);
    maxY = Math.max(maxY, p.y + 0.35);
  }
  const bw = Math.max(maxX - minX, 0.01);
  const bh = Math.max(maxY - minY, 0.01);
  const innerW = Math.max(width - EDGE * 2, 1);
  const innerH = Math.max(height - EDGE * 2, 1);
  let fitScale = Math.min(innerW / bw, innerH / bh);
  const dimPad = DIM_CLEAR_M * fitScale + 36;
  const fitW = Math.max(width - dimPad * 2, 1);
  const fitH = Math.max(height - dimPad * 2, 1);
  fitScale = Math.min(fitW / bw, fitH / bh);
  const scale = lockedScale > 0 ? lockedScale : fitScale;
  const originX = (width - bw * scale) / 2 - minX * scale;
  const originY = (height - bh * scale) / 2 - minY * scale;
  return {
    pts: metres.map((p) => ({ x: p.x * scale + originX, y: p.y * scale + originY })),
    metres,
    scale,
    originX,
    originY,
    offsetX: bMinX * scale + originX,
    offsetY: bMinY * scale + originY,
    areaM2: polygonAreaM2(metres, 1),
  };
}

const DIM_FIT_TEXT_PX = 30;
const VIEW_SCALE_MIN = 6;
const VIEW_SCALE_MAX = 600;

/** Fit the building, porches and both dimension rings (plus their labels) inside the stage. */
function layoutFitWithDims(metres, rooms, width, height, includePoint = null, tightPoints = null) {
  const foot = planFootprintBounds(metres, rooms);
  if (!foot) return layoutFromMetres(metres, width, height, null, includePoint, tightPoints);
  let { minX, minY, maxX, maxY } = foot;
  const includeList = !includePoint ? [] : Array.isArray(includePoint) ? includePoint : [includePoint];
  if (includeList.length) {
    const pad = 2.2;
    for (const p of includeList) {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      minX = Math.min(minX, p.x - pad);
      minY = Math.min(minY, p.y - pad);
      maxX = Math.max(maxX, p.x + pad);
      maxY = Math.max(maxY, p.y + pad);
    }
  }
  for (const p of tightPoints || []) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    minX = Math.min(minX, p.x - 0.35);
    minY = Math.min(minY, p.y - 0.35);
    maxX = Math.max(maxX, p.x + 0.35);
    maxY = Math.max(maxY, p.y + 0.35);
  }
  const fw = Math.max(maxX - minX, 0.01);
  const fh = Math.max(maxY - minY, 0.01);
  let scale = Math.min(width / (fw + 4), height / (fh + 4));
  for (let i = 0; i < 4; i += 1) {
    const fixedPx = Math.max(DIM_LINE_GAP_M * scale, DIM_CHAIN_GAP_PX) + DIM_FIT_TEXT_PX;
    scale = Math.max(
      1,
      Math.min(
        (width - 2 * fixedPx) / (fw + 2 * DIM_CLEAR_M),
        (height - 2 * fixedPx) / (fh + 2 * DIM_CLEAR_M)
      )
    );
  }
  const b = buildingBounds(metres);
  const originX = width / 2 - ((minX + maxX) / 2) * scale;
  const originY = height / 2 - ((minY + maxY) / 2) * scale;
  return {
    pts: metres.map((p) => ({ x: p.x * scale + originX, y: p.y * scale + originY })),
    metres,
    scale,
    originX,
    originY,
    offsetX: originX + b.minX * scale,
    offsetY: originY + b.minY * scale,
    areaM2: polygonAreaM2(metres, 1),
  };
}

const BEDROOM_W_M = 3.6;
const BEDROOM_H_M = 3.0;
const BATHROOM_W_M = 1.8;
const BATHROOM_H_M = 3.6;
const POWDER_W_M = 0.9;
const POWDER_H_M = 2.4;
const LAUNDRY_DEPTH_M = 0.75;
const LAUNDRY_LENGTHS_M = [1.3, 1.4, 1.5];
const LAUNDRY_TROUGH_D_M = 0.6;
const LAUNDRY_TROUGH_W_M = 0.45;
const LAUNDRY_ROOM_W_M = 2.4;
const LAUNDRY_ROOM_H_M = 1.8;
const LAUNDRY_BENCH_D_M = 0.6;
const LAUNDRY_SINK_M = 0.45;
const KITCHEN_W_M = 3.0;
const KITCHEN_H_M = 3.6;
const KITCHEN_BENCH_M = 0.6;
const KITCHEN_OVERHANG_M = 0.3;
const KITCHEN_BAR_M = 0.9;
const KITCHEN_CLEAR_M = 0.9;
const COOKTOP_M = 0.55;
const PANTRY_M = 0.6;
const FRIDGE_ALONG_M = 1.0;
const FRIDGE_ACROSS_M = 0.75;
const SINK_ALONG_M = 1.155;
const SINK_ACROSS_M = 0.495;
const SINK_RIGHT_M = 0.05;
const NIGHTSTAND_M = 0.4;
const NIGHTSTAND_GAP_M = 0.06;
const BENCH_SNAP_IN_M = 0.28;
const KITCHEN_LAYOUTS = [
  "galley",
  "lshape-left",
  "bar-left",
  "lshape-right",
  "bar-right",
  "cshape",
  "cbar-left",
  "cbar-right",
  "island",
  "custom",
];
const PORCH_W_M = 1.5;
const PORCH_H_M = 2.0;
const BED_SHORT_M = 1.8;
const BED_LONG_M = 2.0;
const SHOWER_LONG_M = 1.8;
const SHOWER_SHORT_M = 0.9;
const SHOWER_LEN_MIN_M = 0.9;
const SHOWER_LEN_MAX_M = 2.1;
const SHOWER_LEN_STEP_M = 0.1;
const DOOR_WIDTH_DEFAULT_M = 0.87;
const POWDER_DOOR_WIDTH_M = 0.77;

function roomDoorWidthM(room) {
  return roomKind(room) === "powder" ? POWDER_DOOR_WIDTH_M : DOOR_WIDTH_DEFAULT_M;
}
const DOOR_LEAF_T_M = 0.04;
const SLIDER_PROTRUDE_M = 0.1;
const ROBE_DEPTH_M = 0.6;
const ROBE_WIDTH_DEFAULT_M = 1.6;
const ROBE_MIN_M = 1.2;
const ROBE_MAX_M = 1.8;
const ROBE_DOOR_T_M = 0.02;
const ROBE_NIB_T_M = 0.1;
const VANITY_WIDTH_M = 0.9;
const POWDER_VANITY_M = 0.6;
const VANITY_DEPTH_M = 0.4;
const POWDER_VANITY_DEPTH_M = 0.25;
const WM_SIZE_M = 0.6;
const WM_GAP_M = 0.075;
const WM_SPACE_M = WM_SIZE_M + WM_GAP_M * 2;
const VANITY_WM_BUTT_SNAP_M = 0.15;
const TOILET_TANK_ALONG_M = 0.5;
const TOILET_TANK_DEPTH_M = 0.18;
const TOILET_BOWL_WIDTH_M = 0.32;
const TOILET_BOWL_LENGTH_M = 0.58;
const TOILET_CLEAR_ALONG_M = 0.9;
const TOILET_CLEAR_DEPTH_M = 1.2;
const ROOM_MIN_M = 0.6;
const PLAN_FLOOR = "#d6d0c6";
const PLAN_WOOD = "#d2ae76";
const PLAN_WOOD_DARK = "#c49a5e";
const PLAN_WOOD_EDGE = "#8a6238";
const PLAN_LINEN = "#f7f5f0";
const PLAN_LINEN_EDGE = "#ddd6cc";
const PLAN_RUNNER = "#c6b59c";
const PLAN_RUG = "#d4c4a4";
const PLAN_RUG_EDGE = "#c2b08c";
const PLAN_LAMP = "#f0c94a";
const PLAN_CERAMIC = "#f7f4ef";
const PLAN_CERAMIC_EDGE = "#8a8580";
const BATH_TILE = "#c8c8c8";
const BATH_GROUT = "#b4b4b4";
const TILE_SHORT_M = 0.3;
const TILE_LONG_M = 0.6;
const HYBRID_PLANK_M = 0.15;
const HYBRID_GAP_M = 0.003;
const HYBRID_GAP = "#8a7354";
const HYBRID_PLANKS = ["#dcc9a8", "#d3be9c", "#cdb792", "#d7c3a2"];
const CARPET_BASE = "#c8c8c8";
const CARPET_SHADOW = "#b4b4b4";
const CARPET_HIGHLIGHT = "#dcdcdc";
const PLAN_GLASS = "rgba(196, 214, 222, 0.62)";
const PLAN_COOK = "#4a4a4a";
const PLAN_STEEL_EDGE = "#5c636a";
const PLAN_STEEL_GROOVE = "#7b838b";
/** Brushed-silver stops: diagonal sheen with a bright streak through the middle. */
const SILVER_STOPS = [
  [0, "#eef1f4"],
  [0.28, "#b9c0c7"],
  [0.47, "#ffffff"],
  [0.53, "#f4f6f8"],
  [0.75, "#a4acb4"],
  [1, "#dde2e6"],
];
const SILVER_BOWL_STOPS = [
  [0, "#c9cfd5"],
  [0.3, "#8e979f"],
  [0.5, "#e6eaed"],
  [0.72, "#7f8891"],
  [1, "#b3bac1"],
];

function SilverGradients({ id }) {
  return (
    <defs>
      {[
        [`${id}-plate`, SILVER_STOPS],
        [`${id}-bowl`, SILVER_BOWL_STOPS],
      ].map(([gid, stops]) => (
        <linearGradient key={gid} id={gid} x1="0" y1="0" x2="1" y2="1">
          {stops.map(([o, c]) => (
            <stop key={o} offset={o} stopColor={c} />
          ))}
        </linearGradient>
      ))}
    </defs>
  );
}

function useSilverId() {
  return `silver${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

function canvasSilver(ctx, x, y, w, h, bowl = false) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  for (const [o, c] of bowl ? SILVER_BOWL_STOPS : SILVER_STOPS) g.addColorStop(o, c);
  return g;
}
const ROOM_BLUE = "#8a6238";
const ROOM_BLUE_FILL = PLAN_FLOOR;
const ROOM_PURPLE = "#6b7280";
const ROOM_PURPLE_FILL = PLAN_FLOOR;
const ROOM_KITCHEN = "#8a6238";
const ROOM_KITCHEN_FILL = PLAN_FLOOR;
const ROOM_PORCH = "#4a301c";
const ROOM_PORCH_FILL = "#3a2618";
const DECK_STAINS = ["#7a5232", "#684428", "#57381f", "#73502e", "#4a301a", "#8a5e38"];
const DECK_EDGE = "#2f1e12";
const LIVING_FILL = HYBRID_PLANKS[1];
const ROOM_LIVING = "#6f7f55";
const COUCH_CUSHION_M = 0.8;
const COUCH_ARM_M = 0.1;
const COUCH_BACK_M = 0.15;
const COUCH_W_M = COUCH_CUSHION_M * 3 + COUCH_ARM_M * 2;
const COUCH_D_M = COUCH_CUSHION_M + COUCH_BACK_M;
const TV_UNIT_W_M = 1.8;
const TV_UNIT_D_M = 0.4;
const TV_W_M = 1.4;
const TV_D_M = 0.06;
const COFFEE_W_M = 1.2;
const COFFEE_D_M = 0.6;
const LIVING_SET_GAP_M = 0.3;
const LIVING_SET_ALONG_M = 3.0;
const LIVING_SET_ACROSS_M = 3.4;
const LIVING_SET_MIN_ACROSS_M = TV_UNIT_D_M + COFFEE_D_M + COUCH_D_M + LIVING_SET_GAP_M * 2;
const COUCH_FILL = "#f2efe9";
const COUCH_EDGE = "#8c857b";
const TV_FILL = "#1f1f1f";
const WALL_THICKNESS_M = 0.1;
/** A room wall merges into the external wall only when its side is closer than this. */
const PARTITION_MERGE_M = 0.1;
const PARTITION_MERGE_PROBE_M = PARTITION_MERGE_M - 0.005;
const WALL_FILL = "#2f2f2f";
const PLAN_LINE = 0.75;
const PLAN_LINE_ACTIVE = 1;
const PLAN_LINE_HOVER = 2;

function roomKind(room) {
  if (room?.kind === "bathroom") return "bathroom";
  if (room?.kind === "powder") return "powder";
  if (room?.kind === "laundry") return "laundry";
  if (room?.kind === "laundryRoom") return "laundryRoom";
  if (room?.kind === "kitchen") return "kitchen";
  if (room?.kind === "porch") return "porch";
  if (room?.kind === "living") return "living";
  return "bedroom";
}

function isLaundry(room) {
  return roomKind(room) === "laundry";
}

function isLaundryRoom(room) {
  return roomKind(room) === "laundryRoom";
}

/** Euro laundry: 750 deep, length (1200–1500) runs along x when unrotated / rotated 180. */
function laundryLengthIsX(room) {
  const rot = roomRotation(room);
  return rot === 0 || rot === 180;
}

/** Back wall (fixtures against it); the opposite side is the open cupboard front. */
function laundryBackSide(room) {
  const rot = roomRotation(room);
  return rot === 90 ? "right" : rot === 180 ? "bottom" : rot === 270 ? "left" : "top";
}

function laundryOpenSide(room) {
  const back = laundryBackSide(room);
  return back === "top" ? "bottom" : back === "bottom" ? "top" : back === "left" ? "right" : "left";
}

/** Length snaps to 1200/1300/1400/1500 with the opposite end fixed; depth never changes. */
function resizeLaundry(start, side, next, inner) {
  if (!laundrySideResizable(start, side)) return { ...start };
  const out = { ...start };
  if (side === "left") {
    const right = start.x + start.w;
    out.w = snapLaundryLength(right - next.x);
    out.x = right - out.w;
  } else if (side === "right") {
    out.w = snapLaundryLength(next.w);
  } else if (side === "top") {
    const bottom = start.y + start.h;
    out.h = snapLaundryLength(bottom - next.y);
    out.y = bottom - out.h;
  } else {
    out.h = snapLaundryLength(next.h);
  }
  return inner?.length && !rectInsidePolygon(out, inner) ? { ...start } : out;
}

function laundrySideResizable(room, side) {
  return laundryLengthIsX(room) ? side === "left" || side === "right" : side === "top" || side === "bottom";
}

function snapLaundryLength(len) {
  return LAUNDRY_LENGTHS_M.reduce((best, v) => (Math.abs(v - len) < Math.abs(best - len) ? v : best));
}

/**
 * Fixed fittings: WM space (600 + 75 each side) at one end, trough cabinet along the rest.
 * Measured from the visible wall faces, so partition half-walls are allowed for.
 */
function laundryFixtures(room) {
  const back = laundryBackSide(room);
  const frame = roomWallFrame(room, back);
  const box = (t0, t1, d0, d1) => wallBoxRect(frame.origin, frame.along, frame.inward, t0, t1, d0, d1);
  const end = frame.wallLen;
  const troughStart = end - LAUNDRY_TROUGH_W_M;
  const inset = 0.06;
  return {
    wm: box(WM_GAP_M, WM_GAP_M + WM_SIZE_M, 0, WM_SIZE_M),
    trough: box(troughStart, end, 0, LAUNDRY_TROUGH_D_M),
    basin: box(troughStart + inset, end - inset, inset + 0.03, LAUNDRY_TROUGH_D_M - inset),
  };
}

function defaultLaundryLayout(w, h) {
  const tall = h >= w;
  const doorSide = tall ? "top" : "left";
  const benchSide = tall ? "bottom" : "right";
  const wallLen = benchSide === "left" || benchSide === "right" ? h : w;
  const wmAlong = WM_GAP_M;
  const sinkAlong = wmAlong + WM_SIZE_M + WM_GAP_M;
  return {
    doorSide,
    doorAlong: 0,
    doorFlip: false,
    doorSlide: false,
    benchSide,
    wmAlong: snapPlanMm(wmAlong),
    sinkAlong: snapPlanMm(Math.min(Math.max(0, wallLen - LAUNDRY_SINK_M), sinkAlong)),
  };
}

function clampLaundryWm(along, benchLen) {
  const size = Math.min(WM_SIZE_M, Math.max(0.15, benchLen));
  const gap = benchLen + 0.001 >= WM_SPACE_M ? WM_GAP_M : 0;
  const min = gap;
  const max = Math.max(min, benchLen - gap - size);
  const raw = Number.isFinite(along) ? along : min;
  return snapPlanMm(Math.max(min, Math.min(max, raw)));
}

function clampLaundrySink(along, benchLen, wmAlong) {
  const size = Math.min(LAUNDRY_SINK_M, Math.max(0.15, benchLen));
  const zone0 = wmAlong - WM_GAP_M;
  const zone1 = wmAlong + Math.min(WM_SIZE_M, benchLen) + WM_GAP_M;
  const spans = [];
  if (zone0 + 0.001 >= size) spans.push([0, zone0 - size]);
  if (benchLen - zone1 + 0.001 >= size) spans.push([zone1, benchLen - size]);
  const raw = Number.isFinite(along) ? along : zone1;
  if (!spans.length) return snapPlanMm(Math.max(0, Math.min(Math.max(0, benchLen - size), raw)));
  let best = spans[0][0];
  let bestD = Infinity;
  for (const [a, b] of spans) {
    const c = Math.max(a, Math.min(b, raw));
    const d = Math.abs(c - raw);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return snapPlanMm(best);
}

/**
 * 600mm bench on one wall. The washing-machine space is a 600 square with 75mm either side.
 * The 450 sink sits in the bench. Both slide along the bench.
 */
function laundryBench(room, innerMetres) {
  if (!room || !isLaundryRoom(room)) return null;
  const doorSide = roomDoorSide(room, innerMetres);
  const benchSide = hasBedroomSide(room.benchSide)
    ? room.benchSide
    : doorSide === "top"
      ? "bottom"
      : doorSide === "bottom"
        ? "top"
        : doorSide === "left"
          ? "right"
          : "left";
  const frame = roomWallFrame(room, benchSide);
  let t0 = 0;
  let t1 = frame.wallLen;
  if (benchSide === doorSide) {
    const width = Math.min(roomDoorWidthM(room), Math.max(0.2, frame.wallLen - 0.05));
    const maxAlong = Math.max(0, frame.wallLen - width);
    const stored = Number(room?.doorAlong);
    const open0 = Number.isFinite(stored) ? Math.max(0, Math.min(maxAlong, stored)) : 0;
    const before = open0;
    const after = frame.wallLen - (open0 + width);
    if (after >= before) {
      t0 = open0 + width;
      t1 = frame.wallLen;
    } else {
      t0 = 0;
      t1 = open0;
    }
  }
  const length = Math.max(0, t1 - t0);
  const roomDepth = benchSide === "left" || benchSide === "right" ? room.w : room.h;
  const depth = Math.min(LAUNDRY_BENCH_D_M, Math.max(0.15, roomDepth - 0.05));
  const origin = {
    x: frame.origin.x + frame.along.x * t0,
    y: frame.origin.y + frame.along.y * t0,
  };
  const wmAlong = clampLaundryWm(Number(room?.wmAlong), length);
  const sinkAlong = clampLaundrySink(Number(room?.sinkAlong), length, wmAlong);
  const wmSize = Math.min(WM_SIZE_M, Math.max(0.15, length));
  const wmDepth = Math.min(WM_SIZE_M, depth);
  const sinkSize = Math.min(LAUNDRY_SINK_M, depth, Math.max(0.15, length));
  const sinkD0 = Math.max(0, (depth - sinkSize) / 2);
  return {
    benchSide,
    along: frame.along,
    inward: frame.inward,
    origin,
    length,
    depth,
    rect: wallBoxRect(origin, frame.along, frame.inward, 0, length, 0, depth),
    wm: {
      along: wmAlong,
      rect: wallBoxRect(origin, frame.along, frame.inward, wmAlong, wmAlong + wmSize, 0, wmDepth),
    },
    sink: {
      along: sinkAlong,
      rect: wallBoxRect(
        origin,
        frame.along,
        frame.inward,
        sinkAlong,
        sinkAlong + sinkSize,
        sinkD0,
        sinkD0 + sinkSize
      ),
    },
  };
}

/** Living room furniture group: sits on the open living floor, not a walled room. */
function isLivingSet(room) {
  return roomKind(room) === "living";
}

/** Rooms that carve space out of the open living floor (excludes porches and living sets). */
function walledRooms(rooms) {
  return (rooms || []).filter((r) => !isPorch(r) && !isLivingSet(r));
}

function isBathLike(room) {
  const kind = roomKind(room);
  return kind === "bathroom" || kind === "powder";
}

function bathroomHasShower(room) {
  return roomKind(room) === "bathroom";
}

function showerLenLimits(span) {
  const roomMax = Number.isFinite(span) && span > 0.05 ? span : SHOWER_LEN_MAX_M;
  const maxM = Math.min(SHOWER_LEN_MAX_M, roomMax);
  const minM = Math.min(SHOWER_LEN_MIN_M, maxM);
  const step = Math.round(SHOWER_LEN_STEP_M * 1000);
  const max = Math.floor((Math.floor(maxM * 1000 + 1e-6)) / step) * step;
  let min = Math.ceil((Math.ceil(minM * 1000 - 1e-6)) / step) * step;
  if (min > max) min = max;
  return { min: min / 1000, max: max / 1000 };
}

function showerLengthM(room, span) {
  const { min, max } = showerLenLimits(span);
  const raw = Number(room?.showerLen);
  const base = raw > 0 ? raw : SHOWER_LONG_M;
  const stepped = snapMetresToStep(base, SHOWER_LEN_STEP_M);
  return Math.max(min, Math.min(max, stepped));
}

function vanityLengthM(room) {
  return roomKind(room) === "powder" ? POWDER_VANITY_M : VANITY_WIDTH_M;
}

function defaultBathroomLayout(w, h) {
  const doorW = Math.min(DOOR_WIDTH_DEFAULT_M, Math.max(0.2, Math.min(w, h) - 0.05));
  if (h >= w) {
    const showerW = Math.min(SHOWER_SHORT_M, w);
    const showerH = Math.min(SHOWER_LONG_M, h);
    return {
      doorSide: "top",
      doorAlong: snapPlanMm(Math.max(0, w - doorW)),
      doorFlip: true,
      vanitySide: "top",
      vanityAlong: 0,
      toiletSide: "bottom",
      showerLongIsX: false,
      showerX: 0,
      showerY: snapPlanMm(Math.max(0, h - showerH)),
    };
  }
  const showerW = Math.min(SHOWER_LONG_M, w);
  const showerH = Math.min(SHOWER_SHORT_M, h);
  return {
    doorSide: "right",
    doorAlong: snapPlanMm(Math.max(0, h - doorW)),
    doorFlip: true,
    vanitySide: "right",
    vanityAlong: 0,
    toiletSide: "left",
    showerLongIsX: true,
    showerX: 0,
    showerY: 0,
  };
}

function defaultPowderLayout(w, h) {
  if (h >= w) {
    return {
      toiletSide: "bottom",
      doorSide: "top",
      vanitySide: "left",
      vanityAlong: snapPlanMm(Math.max(0, (h - POWDER_VANITY_M) / 2)),
      doorAlong: 0,
    };
  }
  return {
    toiletSide: "right",
    doorSide: "left",
    vanitySide: "top",
    vanityAlong: snapPlanMm(Math.max(0, (w - POWDER_VANITY_M) / 2)),
    doorAlong: 0,
  };
}

function isPorch(room) {
  return roomKind(room) === "porch";
}

function interiorRooms(rooms) {
  return (rooms || []).filter((r) => !isPorch(r));
}

function porchRooms(rooms) {
  return (rooms || []).filter(isPorch);
}

function roomKindLabel(kind) {
  if (kind === "bathroom") return "Bathroom";
  if (kind === "powder") return "Powder Room";
  if (kind === "laundry") return "Euro Laundry";
  if (kind === "laundryRoom") return "Laundry";
  if (kind === "kitchen") return "Kitchen";
  if (kind === "porch") return "Porch";
  if (kind === "living") return "Living Room";
  return "Bedroom";
}

function roomColors(room) {
  const kind = roomKind(room);
  if (kind === "living") return { stroke: ROOM_LIVING, fill: "none" };
  if (kind === "bathroom") return { stroke: ROOM_PURPLE, fill: BATH_TILE };
  if (kind === "powder" || kind === "laundry" || kind === "laundryRoom") {
    return { stroke: ROOM_PURPLE, fill: HYBRID_PLANKS[1] };
  }
  if (kind === "kitchen") return { stroke: ROOM_KITCHEN, fill: HYBRID_PLANKS[1] };
  if (kind === "porch") return { stroke: ROOM_PORCH, fill: ROOM_PORCH_FILL };
  return { stroke: ROOM_BLUE, fill: CARPET_BASE };
}

function intersectAxisRect(a, b) {
  if (!a || !b) return null;
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  if (!(w > 0.12) || !(h > 0.12)) return null;
  return { x, y, w, h };
}

function footStripRect(bed, bedSide, thickness, inset) {
  const t = Math.min(thickness, Math.max(0.08, (bedSide === "left" || bedSide === "right" ? bed.w : bed.h) * 0.16));
  const pad = inset;
  if (bedSide === "top") {
    return { x: bed.x + pad, y: bed.y + bed.h - pad - t, w: Math.max(0.1, bed.w - pad * 2), h: t };
  }
  if (bedSide === "bottom") {
    return { x: bed.x + pad, y: bed.y + pad, w: Math.max(0.1, bed.w - pad * 2), h: t };
  }
  if (bedSide === "left") {
    return { x: bed.x + bed.w - pad - t, y: bed.y + pad, w: t, h: Math.max(0.1, bed.h - pad * 2) };
  }
  return { x: bed.x + pad, y: bed.y + pad, w: t, h: Math.max(0.1, bed.h - pad * 2) };
}

function robeNibFlags(geom) {
  const alongM = Number(geom?.robeAlongM);
  const wallLen = Number(geom?.robeWallLen);
  const width = Number(geom?.robeWidth);
  if (!Number.isFinite(alongM) || !Number.isFinite(wallLen) || !Number.isFinite(width)) {
    return { start: false, end: false };
  }
  const againstTol = WALL_THICKNESS_M + 0.02;
  return {
    start: alongM > againstTol,
    end: alongM + width < wallLen - againstTol,
  };
}

function robeNibRects(geom) {
  if (!geom?.robeAnchor || !geom.robeAlong || !geom.robeInward) return [];
  const flags = robeNibFlags(geom);
  const t = ROBE_NIB_T_M;
  const d = ROBE_DEPTH_M;
  const width = Number(geom.robeWidth);
  const rects = [];
  if (flags.start) {
    rects.push(wallBoxRect(geom.robeAnchor, geom.robeAlong, geom.robeInward, -t, 0, 0, d));
  }
  if (flags.end) {
    rects.push(wallBoxRect(geom.robeAnchor, geom.robeAlong, geom.robeInward, width, width + t, 0, d));
  }
  return rects;
}

function robeResizeAxis(geom) {
  return Math.abs(geom?.robeAlong?.x || 0) > 0.5 ? "ew" : "ns";
}

function robeResizeHandles(geom) {
  if (!geom?.robeAnchor || !geom.robeAlong || !geom.robeInward) return [];
  const flags = robeNibFlags(geom);
  const t = ROBE_NIB_T_M;
  const d = ROBE_DEPTH_M;
  const width = Number(geom.robeWidth);
  const handles = [];
  if (flags.start) {
    handles.push({
      which: "start",
      point: {
        x: geom.robeAnchor.x + geom.robeAlong.x * (-t / 2) + geom.robeInward.x * (d / 2),
        y: geom.robeAnchor.y + geom.robeAlong.y * (-t / 2) + geom.robeInward.y * (d / 2),
      },
    });
  }
  if (flags.end) {
    handles.push({
      which: "end",
      point: {
        x: geom.robeAnchor.x + geom.robeAlong.x * (width + t / 2) + geom.robeInward.x * (d / 2),
        y: geom.robeAnchor.y + geom.robeAlong.y * (width + t / 2) + geom.robeInward.y * (d / 2),
      },
    });
  }
  return handles;
}

function robeSlidingDoorRects(geom) {
  if (!geom?.robeAnchor || !geom.robeAlong || !geom.robeInward) return [];
  const span = Number(geom.robeWidth);
  if (!(span > 0.05)) return [];
  const t = ROBE_DOOR_T_M;
  const leaf = Math.max(0.2, span * 0.55);
  const front = ROBE_DEPTH_M;
  return [
    wallBoxRect(geom.robeAnchor, geom.robeAlong, geom.robeInward, 0, leaf, front - t * 2, front - t),
    wallBoxRect(geom.robeAnchor, geom.robeAlong, geom.robeInward, span - leaf, span, front - t, front),
  ];
}

function doorLeafThicknessPx(layout) {
  return Math.max(2, (layout?.scale || 40) * DOOR_LEAF_T_M);
}

function robeDoorPx(door, geom, layout) {
  const p = mRectToPx(door, layout);
  const minT = 4;
  const alongX = Math.abs(geom?.robeAlong?.x || 0) > 0.5;
  if (alongX) {
    if (p.h < minT) {
      const grow = minT - p.h;
      if ((geom?.robeInward?.y || 0) > 0) p.y -= grow;
      p.h = minT;
    }
  } else if (p.w < minT) {
    const grow = minT - p.w;
    if ((geom?.robeInward?.x || 0) > 0) p.x -= grow;
    p.w = minT;
  }
  return p;
}

/** Open door leaf; its thickness always goes into the room (towards the swing), whichever way the door hangs. */
function doorLeafQuad(hinge, tip, thicknessPx, closed) {
  const dx = tip.x - hinge.x;
  const dy = tip.y - hinge.y;
  const len = Math.hypot(dx, dy) || 1;
  const toSwing = closed ? (-dy / len) * (closed.x - hinge.x) + (dx / len) * (closed.y - hinge.y) : 1;
  const sign = toSwing < 0 ? -1 : 1;
  const nx = (-dy / len) * thicknessPx * sign;
  const ny = (dx / len) * thicknessPx * sign;
  return [
    { x: hinge.x, y: hinge.y },
    { x: tip.x, y: tip.y },
    { x: tip.x + nx, y: tip.y + ny },
    { x: hinge.x + nx, y: hinge.y + ny },
  ];
}

function nextRoomPlacement(rooms, metres, w, h) {
  const n = interiorRooms(rooms).length;
  const b = buildingBounds(metres);
  const gap = 0.4;
  const cellW = Math.max(BEDROOM_W_M, BATHROOM_W_M, KITCHEN_W_M) + gap;
  const cellH = Math.max(BEDROOM_H_M, BATHROOM_H_M, KITCHEN_H_M) + gap;
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
  return Math.max(10, Math.min(16, layout.scale * 0.22));
}

function roomInnerSnapAxes(rooms) {
  const xs = [];
  const ys = [];
  for (const r of rooms || []) {
    xs.push(r.x, r.x + r.w);
    ys.push(r.y, r.y + r.h);
  }
  return { xs, ys };
}

function edgeInwardNormal(metres, index) {
  const a = metres[index];
  const b = metres[(index + 1) % metres.length];
  const { nx, ny } = polygonEdgeInwardNormal(metres, a, b);
  return { nx, ny };
}

/** Snap the inner face of a building wall to room edges (outer face follows by wall thickness). */
function snapBuildingEdgeMove(moved, index, rooms, { grid = false, thresh = 0.2, wallM = WALL_THICKNESS_M } = {}) {
  const n = moved.length;
  if (n < 2) return moved;
  const a = moved[index];
  const b = moved[(index + 1) % n];
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const out = moved.map((p) => ({ x: p.x, y: p.y }));
  const tenth = (v) => Math.round(v * 10) / 10;
  const { nx, ny } = edgeInwardNormal(moved, index);
  const innerAxes = roomInnerSnapAxes(interiorRooms(rooms));
  const porchAxes = roomInnerSnapAxes(porchRooms(rooms));
  if (dy <= dx * 0.2) {
    const innerY = a.y + ny * wallM;
    const roomSnap = innerAxes.ys.length
      ? nearestSnap(innerY, innerAxes.ys)
      : { dist: Infinity, value: innerY };
    const porchSnap = porchAxes.ys.length
      ? nearestSnap(a.y, porchAxes.ys)
      : { dist: Infinity, value: a.y };
    let y = a.y;
    let best = Infinity;
    if (roomSnap.dist <= thresh && roomSnap.dist < best) {
      y = roomSnap.value - ny * wallM;
      best = roomSnap.dist;
    }
    if (porchSnap.dist <= thresh && porchSnap.dist < best) {
      y = porchSnap.value;
      best = porchSnap.dist;
    }
    if (!(best < Infinity)) {
      if (grid) y = tenth(a.y);
      else return moved;
    }
    out[index] = { x: a.x, y };
    out[(index + 1) % n] = { x: b.x, y };
    return out;
  }
  if (dx <= dy * 0.2) {
    const innerX = a.x + nx * wallM;
    const roomSnap = innerAxes.xs.length
      ? nearestSnap(innerX, innerAxes.xs)
      : { dist: Infinity, value: innerX };
    const porchSnap = porchAxes.xs.length
      ? nearestSnap(a.x, porchAxes.xs)
      : { dist: Infinity, value: a.x };
    let x = a.x;
    let best = Infinity;
    if (roomSnap.dist <= thresh && roomSnap.dist < best) {
      x = roomSnap.value - nx * wallM;
      best = roomSnap.dist;
    }
    if (porchSnap.dist <= thresh && porchSnap.dist < best) {
      x = porchSnap.value;
      best = porchSnap.dist;
    }
    if (!(best < Infinity)) {
      if (grid) x = tenth(a.x);
      else return moved;
    }
    out[index] = { x, y: a.y };
    out[(index + 1) % n] = { x, y: b.y };
    return out;
  }
  return moved;
}

function lerpBuildingEdge(base, moved, index, t) {
  const n = base.length;
  const out = base.map((p) => ({ x: p.x, y: p.y }));
  const j = (index + 1) % n;
  out[index] = lerpPoint(base[index], moved[index], t);
  out[j] = lerpPoint(base[j], moved[j], t);
  return out;
}

function roomsInsideInner(rooms, metres, wallM = WALL_THICKNESS_M) {
  const inner = insetPolygon(metres, wallM);
  if (!inner) return false;
  return interiorRooms(rooms).every((r) => rectInsidePolygon(r, inner));
}

/** Stop a wall from moving inward through rooms. */
function clampBuildingEdgeToRooms(base, moved, index, rooms, wallM = WALL_THICKNESS_M) {
  const inside = interiorRooms(rooms);
  if (!inside.length) return moved;
  if (roomsInsideInner(inside, moved, wallM)) return moved;
  if (!roomsInsideInner(inside, base, wallM)) return base;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    const cand = lerpBuildingEdge(base, moved, index, mid);
    if (roomsInsideInner(inside, cand, wallM)) lo = mid;
    else hi = mid;
  }
  return lerpBuildingEdge(base, moved, index, lo);
}

function insetPolygon(pts, dist) {
  if (!pts || pts.length < 3 || !(dist > 0)) return null;
  const n = pts.length;
  const ccw = polygonSignedAreaXY(pts) >= 0;
  const shifted = [];
  for (let i = 0; i < n; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) {
      shifted.push(null);
      continue;
    }
    const nx = (ccw ? -dy : dy) / len;
    const ny = (ccw ? dx : -dx) / len;
    shifted.push({
      a: { x: a.x + nx * dist, y: a.y + ny * dist },
      ux: dx / len,
      uy: dy / len,
    });
  }
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const prev = shifted[(i - 1 + n) % n];
    const cur = shifted[i];
    if (prev && cur) {
      const hit = intersectAxes(prev.a, prev.ux, prev.uy, cur.a, cur.ux, cur.uy);
      if (hit) {
        out.push(hit);
        continue;
      }
    }
    out.push(cur?.a || prev?.a || { x: pts[i].x, y: pts[i].y });
  }
  if (out.length < 3) return null;
  if (!pointInPolygon(polygonCentroid(out), pts)) return null;
  if (polygonAreaM2(out, 1) < 0.25) return null;
  return out;
}

const EAVE_DEFAULT_M = 0.3;
const EAVE_STEP_M = 0.05;
const EAVE_MAX_M = 0.6;
const EAVE_COLLAPSE_M = 0.02;

function normalizeEaveDepths(depths, count) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const v = Number(depths?.[i]);
    const depth = Number.isFinite(v) ? v : EAVE_DEFAULT_M;
    out.push(Math.min(EAVE_MAX_M, Math.max(0, depth)));
  }
  return out;
}

function buildingEdgeFrame(pts, index) {
  const n = pts.length;
  const a = pts[index];
  const b = pts[(index + 1) % n];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const inn = polygonEdgeInwardNormal(pts, a, b);
  return {
    a,
    b,
    len,
    ux: len > 1e-9 ? dx / len : 1,
    uy: len > 1e-9 ? dy / len : 0,
    nx: -inn.nx,
    ny: -inn.ny,
  };
}

function eaveLineScalar(pts, index, depth) {
  const edge = buildingEdgeFrame(pts, index);
  return edge.a.x * edge.nx + edge.a.y * edge.ny + depth;
}

/** Outward offset of each wall edge. Corners are the mitres of the neighbouring eave lines. */
function eaveOffsetCorners(pts, depths) {
  const n = pts.length;
  const lines = [];
  for (let i = 0; i < n; i += 1) {
    const edge = buildingEdgeFrame(pts, i);
    const d = depths[i] || 0;
    lines.push({
      ...edge,
      ox: edge.a.x + edge.nx * d,
      oy: edge.a.y + edge.ny * d,
    });
  }
  const corners = [];
  for (let i = 0; i < n; i += 1) {
    const prev = lines[(i - 1 + n) % n];
    const cur = lines[i];
    const hit = intersectAxes(
      { x: prev.ox, y: prev.oy },
      prev.ux,
      prev.uy,
      { x: cur.ox, y: cur.oy },
      cur.ux,
      cur.uy
    );
    corners.push(hit || { x: cur.ox, y: cur.oy });
  }
  return { lines, corners };
}

function eavePiecesCollinear(run, piece) {
  const crossA = (piece.a.x - run.a.x) * run.uy - (piece.a.y - run.a.y) * run.ux;
  const crossB = (piece.b.x - run.a.x) * run.uy - (piece.b.y - run.a.y) * run.ux;
  const sameWay = piece.ux * run.ux + piece.uy * run.uy > 0.98;
  const joined = Math.hypot(piece.a.x - run.b.x, piece.a.y - run.b.y) <= EAVE_COLLAPSE_M * 2;
  return sameWay && joined && Math.abs(crossA) <= EAVE_COLLAPSE_M && Math.abs(crossB) <= EAVE_COLLAPSE_M;
}

/**
 * Eave runs around the outer wall. A run is one dashed segment.
 * Edges whose eave lines meet (a notch pulled out flush, or a straight wall) are one run.
 */
function eaveRuns(pts, depths) {
  if (!pts || pts.length < 3) return [];
  const safe = normalizeEaveDepths(depths, pts.length);
  const { lines, corners } = eaveOffsetCorners(pts, safe);
  const pieces = [];
  for (let i = 0; i < pts.length; i += 1) {
    if (lines[i].len < EAVE_COLLAPSE_M) continue;
    const a = corners[i];
    const b = corners[(i + 1) % pts.length];
    const signed = (b.x - a.x) * lines[i].ux + (b.y - a.y) * lines[i].uy;
    if (signed <= EAVE_COLLAPSE_M) continue;
    pieces.push({
      edges: [i],
      a,
      b,
      nx: lines[i].nx,
      ny: lines[i].ny,
      ux: lines[i].ux,
      uy: lines[i].uy,
    });
  }
  if (!pieces.length) return [];
  let guard = pieces.length + 2;
  while (pieces.length > 1 && guard > 0) {
    guard -= 1;
    let merged = false;
    for (let i = 0; i < pieces.length; i += 1) {
      const j = (i + 1) % pieces.length;
      if (!eavePiecesCollinear(pieces[i], pieces[j])) continue;
      pieces[i].b = pieces[j].b;
      pieces[i].edges.push(...pieces[j].edges);
      pieces.splice(j, 1);
      merged = true;
      break;
    }
    if (!merged) break;
  }
  return pieces;
}

function shiftEaveDepths(startDepths, active, delta) {
  const next = startDepths.slice();
  let d = delta;
  let minStart = Infinity;
  let maxStart = -Infinity;
  for (const i of active) {
    minStart = Math.min(minStart, startDepths[i]);
    maxStart = Math.max(maxStart, startDepths[i]);
  }
  if (minStart + d < 0) d = -minStart;
  if (maxStart + d > EAVE_MAX_M) d = EAVE_MAX_M - maxStart;
  for (const i of active) next[i] = Math.min(EAVE_MAX_M, Math.max(0, startDepths[i] + d));
  return { depths: next, delta: d };
}

/** When a dragged eave reaches a parallel eave, snap onto it and keep any extra travel in 50 mm steps. */
function applyEaveDelta(pts, startDepths, active, delta) {
  let d = Math.round(delta / EAVE_STEP_M) * EAVE_STEP_M;
  const shifted = shiftEaveDepths(startDepths, active, d);
  d = shifted.delta;
  const primary = active[0];
  const origin = buildingEdgeFrame(pts, primary);
  const startS = eaveLineScalar(pts, primary, startDepths[primary]);
  const traveled = eaveLineScalar(pts, primary, shifted.depths[primary]) - startS;
  let meeting = null;
  for (let j = 0; j < pts.length; j += 1) {
    if (active.includes(j)) continue;
    const other = buildingEdgeFrame(pts, j);
    if (origin.nx * other.nx + origin.ny * other.ny < 0.98) continue;
    const needed = eaveLineScalar(pts, j, startDepths[j]) - startS;
    if (Math.abs(needed) > 1e-4 && needed * traveled < 0) continue;
    if (Math.abs(traveled) + EAVE_STEP_M * 0.5 < Math.abs(needed) - 1e-4) continue;
    const trial = shiftEaveDepths(startDepths, active, needed);
    const run = eaveRuns(pts, trial.depths).find((item) => item.edges.some((edge) => active.includes(edge)));
    if (!run || !run.edges.includes(j)) continue;
    if (!meeting || Math.abs(needed) < Math.abs(meeting.needed)) meeting = { needed, edges: run.edges };
  }
  if (!meeting) return { depths: shifted.depths, delta: d, magnet: false, joinEdges: null, meetDelta: 0 };
  const excess = Math.round((d - meeting.needed) / EAVE_STEP_M) * EAVE_STEP_M;
  const joined = shiftEaveDepths(startDepths, active, meeting.needed + excess);
  const lineS = eaveLineScalar(pts, primary, joined.depths[primary]);
  for (const edge of meeting.edges) {
    if (active.includes(edge)) continue;
    const required = lineS - eaveLineScalar(pts, edge, 0);
    if (required > EAVE_MAX_M + 1e-4 || required < -1e-4) {
      return { depths: shifted.depths, delta: d, magnet: false, joinEdges: null, meetDelta: 0 };
    }
  }
  return {
    depths: joined.depths,
    delta: joined.delta,
    magnet: true,
    joinEdges: meeting.edges,
    meetDelta: meeting.needed,
  };
}

function eaveEdgesByDepth(depths, edges) {
  let min = Infinity;
  for (const edge of edges) min = Math.min(min, depths[edge]);
  const base = [];
  const extended = [];
  for (const edge of edges) {
    if (depths[edge] <= min + 0.001) base.push(edge);
    else extended.push(edge);
  }
  return { base, extended };
}

/** One drag step. Pulling back inside a join restores the eaves that were met. */
function stepEaveDrag(drag, pts, rawDelta) {
  let applied;
  if (drag.joined) {
    const stepped = drag.joinDelta + Math.round((rawDelta - drag.joinDelta) / EAVE_STEP_M) * EAVE_STEP_M;
    if (stepped < drag.meetDelta - 1e-6) {
      drag.joined = false;
      drag.active = drag.originActive.slice();
      for (const edge of drag.baseEdges) drag.startDepths[edge] = drag.originalDepths[edge];
      applied = shiftEaveDepths(drag.originalDepths, drag.originActive, stepped);
      for (const edge of drag.baseEdges) applied.depths[edge] = drag.originalDepths[edge];
    } else {
      applied = shiftEaveDepths(drag.startDepths, drag.active, stepped);
    }
  } else {
    applied = applyEaveDelta(pts, drag.startDepths, drag.active, rawDelta);
    if (applied.magnet && applied.joinEdges) {
      const lineS = eaveLineScalar(pts, drag.primary, applied.depths[drag.primary]);
      const added = [];
      for (const edge of applied.joinEdges) {
        if (drag.active.includes(edge)) continue;
        const required = lineS - eaveLineScalar(pts, edge, 0);
        drag.startDepths[edge] = required - applied.delta;
        applied.depths[edge] = required;
        drag.active.push(edge);
        added.push(edge);
      }
      if (added.length) {
        drag.baseEdges = added;
        drag.joined = true;
        drag.joinDelta = applied.delta;
        drag.meetDelta = applied.meetDelta;
      }
    }
  }
  return applied;
}

function hitEaveRun(runs, layout, raw) {
  if (!runs?.length || !layout) return null;
  let best = null;
  const limit = Math.max(EDGE_HIT_PX, 14);
  for (let i = 0; i < runs.length; i += 1) {
    const run = runs[i];
    const d = distToSegment(raw, mPointToPx(run.a, layout), mPointToPx(run.b, layout));
    if (d <= limit && (!best || d < best.d)) best = { index: i, run, d };
  }
  return best;
}

function eaveDepthLabel(depths, edges) {
  let min = Infinity;
  for (const edge of edges || []) min = Math.min(min, depths[edge]);
  return `${formatPlanMm(Number.isFinite(min) ? min : 0)} mm`;
}

function closestEaveEdge(pts, edges, cursor) {
  let best = edges[0];
  let bestD = Infinity;
  for (const i of edges) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const d = distToSegment(cursor, a, b);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function pickPerimeterHit(metres, depths, layout, raw) {
  const runs = eaveRuns(metres, depths);
  const eave = hitEaveRun(runs, layout, raw);
  const building = hitTestEdge(layout.pts, raw, true);
  let buildingD = Infinity;
  if (building) {
    const a = layout.pts[building.index];
    const b = layout.pts[(building.index + 1) % layout.pts.length];
    buildingD = distToSegment(raw, a, b);
  }
  if (eave && eave.d <= buildingD) return { kind: "eave", eave, runs };
  if (building) return { kind: "building", building };
  return null;
}

function eavePathD(runs, layout) {
  if (!runs?.length) return "";
  const parts = [];
  let cursor = null;
  runs.forEach((run) => {
    const a = mPointToPx(run.a, layout);
    const b = mPointToPx(run.b, layout);
    if (!cursor || Math.hypot(cursor.x - a.x, cursor.y - a.y) > 1.5) parts.push(`M ${a.x} ${a.y}`);
    parts.push(`L ${b.x} ${b.y}`);
    cursor = b;
  });
  const first = mPointToPx(runs[0].a, layout);
  if (cursor && Math.hypot(cursor.x - first.x, cursor.y - first.y) <= 1.5) parts.push("Z");
  return parts.join(" ");
}

function drawEaveCanvas(ctx, layout) {
  const runs = eaveRuns(layout?.metres, layout?.eaveDepths);
  if (!runs.length) return;
  ctx.save();
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 1.35;
  ctx.lineJoin = "miter";
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  let cursor = null;
  for (const run of runs) {
    const a = mPointToPx(run.a, layout);
    const b = mPointToPx(run.b, layout);
    if (!cursor || Math.hypot(cursor.x - a.x, cursor.y - a.y) > 1.5) {
      ctx.moveTo(a.x, a.y);
    }
    ctx.lineTo(b.x, b.y);
    cursor = b;
  }
  const first = mPointToPx(runs[0].a, layout);
  if (cursor && Math.hypot(cursor.x - first.x, cursor.y - first.y) <= 1.5) ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

const WALL_COLINEAR_M = 0.08;
const WALL_MIN_LEN_M = 0.05;

function roomNeedsPartitionWalls(room) {
  const kind = roomKind(room);
  return kind === "bedroom" || kind === "bathroom" || kind === "powder" || kind === "laundry" || kind === "laundryRoom";
}

function almostEqualM(a, b, tol = WALL_COLINEAR_M) {
  return Math.abs(a - b) <= tol;
}

function axisEdgeFromPoints(a, b) {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  if (dy <= WALL_COLINEAR_M && dx > WALL_COLINEAR_M) {
    return { axis: "h", y: (a.y + b.y) / 2, t0: Math.min(a.x, b.x), t1: Math.max(a.x, b.x) };
  }
  if (dx <= WALL_COLINEAR_M && dy > WALL_COLINEAR_M) {
    return { axis: "v", x: (a.x + b.x) / 2, t0: Math.min(a.y, b.y), t1: Math.max(a.y, b.y) };
  }
  return null;
}

/** Default spot for the m² label: under the middle of the lowest, longest bottom-facing outer wall. */
function areaLabelAnchorM(outer, rooms) {
  let best = null;
  for (let i = 0; i < (outer || []).length; i += 1) {
    const a = outer[i];
    const c = outer[(i + 1) % outer.length];
    const edge = axisEdgeFromPoints(a, c);
    if (!edge || edge.axis !== "h") continue;
    if (polygonEdgeInwardNormal(outer, a, c).ny >= 0) continue;
    const len = edge.t1 - edge.t0;
    if (
      !best ||
      edge.y > best.y + WALL_COLINEAR_M ||
      (Math.abs(edge.y - best.y) <= WALL_COLINEAR_M && len > best.len)
    ) {
      best = { x: (edge.t0 + edge.t1) / 2, y: edge.y, len };
    }
  }
  if (!best) return null;
  let y = best.y;
  for (const r of rooms || []) {
    if (best.x > r.x && best.x < r.x + r.w && y + 0.05 > r.y && y + 0.05 < r.y + r.h) {
      y = r.y + r.h;
    }
  }
  return { x: best.x, y };
}

function outlineAxisEdges(poly) {
  const edges = [];
  if (!poly || poly.length < 2) return edges;
  for (let i = 0; i < poly.length; i += 1) {
    const edge = axisEdgeFromPoints(poly[i], poly[(i + 1) % poly.length]);
    if (edge) edges.push(edge);
  }
  return edges;
}

function subtractIntervals(start, end, cuts) {
  let segs = [[Math.min(start, end), Math.max(start, end)]];
  const sorted = (cuts || [])
    .map(([a, b]) => [Math.min(a, b), Math.max(a, b)])
    .sort((p, q) => p[0] - q[0]);
  for (const [c0, c1] of sorted) {
    const next = [];
    for (const [s0, s1] of segs) {
      if (c1 <= s0 + 1e-9 || c0 >= s1 - 1e-9) {
        next.push([s0, s1]);
        continue;
      }
      if (c0 > s0 + WALL_MIN_LEN_M) next.push([s0, Math.min(s1, c0)]);
      if (c1 < s1 - WALL_MIN_LEN_M) next.push([Math.max(s0, c1), s1]);
    }
    segs = next.filter(([a, b]) => b - a > WALL_MIN_LEN_M);
  }
  return segs;
}

function mergePartitionWalls(segs) {
  const groups = new Map();
  for (const s of segs || []) {
    const key = s.axis === "h" ? `h:${Math.round(s.y * 100)}` : `v:${Math.round(s.x * 100)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        axis: s.axis,
        x: s.x,
        y: s.y,
        intervals: [],
      });
    }
    groups.get(key).intervals.push([s.t0, s.t1]);
  }
  const out = [];
  for (const g of groups.values()) {
    const iv = g.intervals
      .map(([a, b]) => [Math.min(a, b), Math.max(a, b)])
      .sort((p, q) => p[0] - q[0]);
    if (!iv.length) continue;
    let cur = iv[0];
    for (let i = 1; i < iv.length; i += 1) {
      if (iv[i][0] <= cur[1] + WALL_MIN_LEN_M) {
        cur[1] = Math.max(cur[1], iv[i][1]);
      } else {
        out.push(
          g.axis === "h"
            ? { axis: "h", y: g.y, t0: cur[0], t1: cur[1] }
            : { axis: "v", x: g.x, t0: cur[0], t1: cur[1] }
        );
        cur = iv[i];
      }
    }
    out.push(
      g.axis === "h"
        ? { axis: "h", y: g.y, t0: cur[0], t1: cur[1] }
        : { axis: "v", x: g.x, t0: cur[0], t1: cur[1] }
    );
  }
  return out;
}

function externalCutsOnSide(side, innerPoly, probeM) {
  if (!innerPoly?.length || !(side.t1 - side.t0 > WALL_MIN_LEN_M)) return [];
  const n = Math.max(12, Math.ceil((side.t1 - side.t0) / 0.12));
  const outside = [];
  for (let i = 0; i <= n; i += 1) {
    const t = side.t0 + ((side.t1 - side.t0) * i) / n;
    const p =
      side.axis === "h"
        ? { x: t, y: side.y + side.oy * probeM }
        : { x: side.x + side.ox * probeM, y: t };
    outside.push(!pointInPolygon(p, innerPoly));
  }
  const cuts = [];
  let run = null;
  const at = (i) => side.t0 + ((side.t1 - side.t0) * i) / n;
  const isOut = (t) =>
    !pointInPolygon(side.axis === "h" ? { x: t, y: side.y + side.oy * probeM } : { x: side.x + side.ox * probeM, y: t }, innerPoly);
  /** Exact crossing between two samples, so the cut ends on the external wall face. */
  const crossing = (lo, hi, loOut) => {
    let a = lo;
    let b = hi;
    for (let k = 0; k < 20; k += 1) {
      const m = (a + b) / 2;
      if (isOut(m) === loOut) a = m;
      else b = m;
    }
    return roundMm((a + b) / 2);
  };
  for (let i = 0; i <= n; i += 1) {
    if (outside[i]) {
      if (run == null) run = i === 0 ? side.t0 : crossing(at(i - 1), at(i), false);
    } else if (run != null) {
      cuts.push([run, crossing(at(i - 1), at(i), true)]);
      run = null;
    }
  }
  if (run != null) cuts.push([run, side.t1]);
  return cuts;
}

function roomDoorSide(room, innerMetres) {
  const s = room?.doorSide;
  if (s === "top" || s === "right" || s === "bottom" || s === "left") return s;
  return bedroomEntrySide(room, innerMetres);
}

function rotateDoorSide(side) {
  if (side === "top") return "right";
  if (side === "right") return "bottom";
  if (side === "bottom") return "left";
  if (side === "left") return "top";
  return side;
}

function nearestRoomSide(room, p) {
  const x0 = room.x;
  const y0 = room.y;
  const x1 = room.x + room.w;
  const y1 = room.y + room.h;
  const hits = [
    { side: "top", d: Math.abs(p.y - y0), t: p.x - x0, wallLen: room.w },
    { side: "bottom", d: Math.abs(p.y - y1), t: p.x - x0, wallLen: room.w },
    { side: "left", d: Math.abs(p.x - x0), t: p.y - y0, wallLen: room.h },
    { side: "right", d: Math.abs(p.x - x1), t: p.y - y0, wallLen: room.h },
  ];
  hits.sort((a, b) => a.d - b.d);
  return hits[0];
}

function roomRobeWidthM(room) {
  const w = Number(room?.robeWidth);
  const raw = w > 0 ? w : ROBE_WIDTH_DEFAULT_M;
  return snapPlanMm(Math.max(ROBE_MIN_M, Math.min(ROBE_MAX_M, raw)));
}

function snapPlanMm(m) {
  return snapMetresToStep(m, BUILDING_STEP_M);
}

function roomWallFrame(room, side) {
  const x0 = room.x;
  const y0 = room.y;
  const x1 = room.x + room.w;
  const y1 = room.y + room.h;
  if (side === "top") {
    return { along: { x: 1, y: 0 }, inward: { x: 0, y: 1 }, wallLen: room.w, origin: { x: x0, y: y0 } };
  }
  if (side === "right") {
    return { along: { x: 0, y: 1 }, inward: { x: -1, y: 0 }, wallLen: room.h, origin: { x: x1, y: y0 } };
  }
  if (side === "bottom") {
    return { along: { x: 1, y: 0 }, inward: { x: 0, y: -1 }, wallLen: room.w, origin: { x: x0, y: y1 } };
  }
  return { along: { x: 0, y: 1 }, inward: { x: 1, y: 0 }, wallLen: room.h, origin: { x: x0, y: y0 } };
}

function toiletBowlFront(side) {
  if (side === "top") return "bottom";
  if (side === "bottom") return "top";
  if (side === "left") return "right";
  return "left";
}

function roundedFrontPathD(r, front) {
  const x = r.x;
  const y = r.y;
  const w = r.w;
  const h = r.h;
  const rx = Math.max(0.5, Math.min(w, h) / 2);
  if (front === "bottom") {
    const y2 = y + h - rx;
    return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y2} A ${rx} ${rx} 0 0 1 ${x} ${y2} Z`;
  }
  if (front === "top") {
    const y2 = y + rx;
    return `M ${x} ${y + h} L ${x + w} ${y + h} L ${x + w} ${y2} A ${rx} ${rx} 0 0 0 ${x} ${y2} Z`;
  }
  if (front === "right") {
    const x2 = x + w - rx;
    return `M ${x} ${y} L ${x} ${y + h} L ${x2} ${y + h} A ${rx} ${rx} 0 0 0 ${x2} ${y} Z`;
  }
  const x2 = x + rx;
  return `M ${x + w} ${y} L ${x + w} ${y + h} L ${x2} ${y + h} A ${rx} ${rx} 0 0 1 ${x2} ${y} Z`;
}

function drawRoundedFrontRect(ctx, r, front) {
  const path = new Path2D(roundedFrontPathD(r, front));
  ctx.fill(path);
  ctx.stroke(path);
}

function defaultRobePlacement(room, doorSide) {
  const robeWidth = roomRobeWidthM(room);
  if (doorSide === "top") {
    return { side: "left", along: Math.max(0, room.h - Math.min(robeWidth, Math.max(0.2, room.h - 0.05))) };
  }
  if (doorSide === "right") return { side: "top", along: 0 };
  if (doorSide === "bottom") return { side: "left", along: 0 };
  return { side: "bottom", along: Math.max(0, room.w - Math.min(robeWidth, Math.max(0.2, room.w - 0.05))) };
}

function rectCenter(rect) {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

function unionRect(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

function unionRects(rects) {
  return (rects || []).filter((r) => r && r.w > 0 && r.h > 0).reduce((acc, r) => (acc ? unionRect(acc, r) : r), null);
}

function bedGroupSidePad() {
  return NIGHTSTAND_M + NIGHTSTAND_GAP_M;
}

/** Keep 1800 bed + 400 nightstands as a rigid group; never shrink the tables. */
function clampBedAlong(wallLen, along) {
  const alongLen = BED_SHORT_M;
  const sidePad = bedGroupSidePad();
  const maxAlong = Math.max(0, wallLen - alongLen);
  const paddedMin = sidePad;
  const paddedMax = wallLen - alongLen - sidePad;
  if (paddedMax >= paddedMin) {
    const raw = Number.isFinite(along) ? along : (paddedMin + paddedMax) / 2;
    return Math.max(paddedMin, Math.min(paddedMax, raw));
  }
  return maxAlong / 2;
}

function clampRectInRoom(room, rect) {
  const w = Math.min(rect.w, Math.max(0.05, room.w));
  const h = Math.min(rect.h, Math.max(0.05, room.h));
  return {
    x: Math.max(room.x, Math.min(room.x + room.w - w, rect.x)),
    y: Math.max(room.y, Math.min(room.y + room.h - h, rect.y)),
    w,
    h,
  };
}

function applyStoredRoomRect(room, keyX, keyY, defaultRect) {
  const lx = Number(room?.[keyX]);
  const ly = Number(room?.[keyY]);
  if (!Number.isFinite(lx) || !Number.isFinite(ly)) return defaultRect;
  return clampRectInRoom(room, {
    x: room.x + lx,
    y: room.y + ly,
    w: defaultRect.w,
    h: defaultRect.h,
  });
}

function rotateLocalRect90(rect, roomW, roomH) {
  const cx = roomW / 2;
  const cy = roomH / 2;
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
  ].map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return { x: -dy, y: dx };
  });
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: roomH / 2 + minX,
    y: roomW / 2 + minY,
    w: Math.max(...xs) - minX,
    h: Math.max(...ys) - minY,
  };
}

function fixtureGrabPx(layout) {
  return Math.max(8, handlePx(layout) * 0.85);
}

function controlHint(hover) {
  if (!hover) return "";
  const type = hover.type;
  if (type === "bed") return "Drag bed";
  if (type === "robe") return "Drag robe";
  if (type === "robe-resize") return "Resize robe";
  if (type === "room-delete") return "Delete";
  if (type === "couch-options") return "Couch options";
  if (type === "porch-options") return "Porch steps";
  if (type === "vanity-options") return "Vanity options";
  if (type === "vanity-options-full") return "No room for WM";
  if (type === "design-move") return "Move design";
  if (type === "design-rotate") return "Rotate design";
  if (type === "door") return "Drag door";
  if (type === "door-flip") return "Flip door";
  if (type === "door-options") return "Swing or sliding";
  if (type === "shower") return "Drag shower";
  if (type === "shower-resize") return "Resize shower";
  if (type === "shower-rotate") return "Rotate shower";
  if (type === "toilet") return "Drag toilet";
  if (type === "vanity") return "Drag vanity";
  if (type === "laundry-bench") return "Drag bench";
  if (type === "laundry-wm") return "Drag washing machine";
  if (type === "laundry-sink") return "Drag sink";
  if (type === "kitchen-layout") return "Kitchen layout";
  if (type === "kitchen-custom") return "Click a wall, then drag along it to draw the bench";
  if (type === "kitchen-run") return "Resize length";
  if (type === "cook") return "Drag cooktop";
  if (type === "sink") return "Drag sink";
  if (type === "sink-mirror") return "Mirror sink";
  if (type === "pantry") return "Drag pantry";
  if (type === "fridge") return "Drag fridge";
  if (type === "room-move") return "Drag room";
  if (type === "room-rotate") return "Rotate room";
  if (type === "porch-move") return "Drag porch";
  if (type === "porch-resize") return "Extend porch";
  if (type === "resize-building") return "Resize building";
  if (type === "eave") return hover.depthLabel ? `Drag eave · ${hover.depthLabel}` : "Drag eave";
  if (type === "resize") return "Resize";
  if (hover.kind === "rotate") return "Rotate";
  if (hover.kind === "move") return "Drag";
  if (hover.kind === "ns" || hover.kind === "ew") return "Resize";
  return "";
}

function hintAt(hover, raw) {
  if (!hover) return null;
  return {
    ...hover,
    x: raw?.x,
    y: raw?.y,
    hint: controlHint(hover),
  };
}

function GrabSquare({ cx, cy, size, color }) {
  if (cx == null || cy == null) return null;
  return (
    <rect
      x={cx - size / 2}
      y={cy - size / 2}
      width={size}
      height={size}
      fill={WHITE}
      stroke={color}
      strokeWidth="1.2"
    />
  );
}

function AxisHandle({ cx, cy, size, color, axis }) {
  if (cx == null || cy == null) return null;
  const s = size / 2;
  const arm = size * 0.95;
  const head = Math.max(3, size * 0.28);
  const ew = axis === "ew";
  const a = ew
    ? [
        [cx - arm, cy, cx + arm, cy],
        [
          `${cx - arm},${cy} ${cx - arm + head},${cy - head * 0.7} ${cx - arm + head},${cy + head * 0.7}`,
          `${cx + arm},${cy} ${cx + arm - head},${cy - head * 0.7} ${cx + arm - head},${cy + head * 0.7}`,
        ],
      ]
    : [
        [cx, cy - arm, cx, cy + arm],
        [
          `${cx},${cy - arm} ${cx - head * 0.7},${cy - arm + head} ${cx + head * 0.7},${cy - arm + head}`,
          `${cx},${cy + arm} ${cx - head * 0.7},${cy + arm - head} ${cx + head * 0.7},${cy + arm - head}`,
        ],
      ];
  const [x1, y1, x2, y2] = a[0];
  return (
    <g>
      <circle cx={cx} cy={cy} r={s} fill={WHITE} stroke={color} strokeWidth="1.2" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <polygon points={a[1][0]} fill={color} />
      <polygon points={a[1][1]} fill={color} />
    </g>
  );
}

function OptionsHandle({ cx, cy, size, color }) {
  if (cx == null || cy == null) return null;
  const s = size;
  return (
    <g transform={`translate(${cx}, ${cy})`}>
      <circle r={s / 2 + 1} fill={WHITE} stroke={color} strokeWidth="1.5" />
      <rect
        x={-s * 0.28}
        y={s * 0.04}
        width={s * 0.56}
        height={s * 0.16}
        rx={0.6}
        fill={color}
      />
      <rect
        x={-s * 0.28}
        y={-s * 0.26}
        width={s * 0.18}
        height={s * 0.24}
        rx={0.6}
        fill={color}
      />
    </g>
  );
}

function RotateHandle({ cx, cy, size, color }) {
  if (cx == null || cy == null) return null;
  const hs = size;
  return (
    <g transform={`translate(${cx}, ${cy})`}>
      <circle r={hs / 2 + 1} fill={WHITE} stroke={color} strokeWidth="1.5" />
      <path
        d={`M ${-hs * 0.22} ${-hs * 0.08} A ${hs * 0.28} ${hs * 0.28} 0 1 1 ${hs * 0.08} ${-hs * 0.22}`}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d={`M ${hs * 0.08} ${-hs * 0.38} L ${hs * 0.08} ${-hs * 0.08} L ${-hs * 0.16} ${-hs * 0.22}`}
        fill={color}
      />
    </g>
  );
}

function MirrorHandle({ cx, cy, size, color }) {
  if (cx == null || cy == null) return null;
  const s = size;
  return (
    <g transform={`translate(${cx}, ${cy})`}>
      <circle r={s / 2 + 1} fill={WHITE} stroke={color} strokeWidth="1.5" />
      <line
        x1={0}
        y1={-s * 0.34}
        x2={0}
        y2={s * 0.34}
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d={`M ${-s * 0.3} 0 L ${-s * 0.08} ${-s * 0.22} L ${-s * 0.08} ${s * 0.22} Z`}
        fill={color}
      />
      <path
        d={`M ${s * 0.3} 0 L ${s * 0.08} ${-s * 0.22} L ${s * 0.08} ${s * 0.22} Z`}
        fill={color}
      />
    </g>
  );
}

function doorFlipHandlePx(door, layout) {
  const p = mPointToPx(door.open, layout);
  return { cx: p.x, cy: p.y, size: fixtureGrabPx(layout) };
}

function hitDoorFlipHandle(door, layout, raw) {
  if (!door?.open) return null;
  const { cx, cy, size } = doorFlipHandlePx(door, layout);
  const half = size / 2 + 5;
  if (Math.abs(raw.x - cx) <= half && Math.abs(raw.y - cy) <= half) {
    return { type: "door-flip", kind: "rotate" };
  }
  return null;
}

function flipRoomDoor(room) {
  return { ...room, doorFlip: !room.doorFlip };
}

function cycleRoomDoorStyle(room, innerMetres) {
  const doorSlide = !room?.doorSlide;
  if (!doorSlide) return { ...room, doorSlide: false };
  const door = roomDoorSwing(room, innerMetres);
  if (!door) return { ...room, doorSlide: true };
  const frame = roomWallFrame(room, door.doorSide);
  const along = Number.isFinite(Number(room?.doorAlong)) ? Number(room.doorAlong) : 0;
  const startSpace = Math.max(0, along);
  const endSpace = Math.max(0, frame.wallLen - along - door.doorWidth);
  const flipped = Boolean(room?.doorFlip);
  const here = flipped ? endSpace : startSpace;
  const there = flipped ? startSpace : endSpace;
  const need = Math.max(0, door.doorWidth - SLIDER_PROTRUDE_M);
  if (here + 0.02 < need && there > here) return { ...room, doorSlide: true, doorFlip: !flipped };
  return { ...room, doorSlide: true };
}

function doorOptionsHandlePx(door, layout) {
  if (!door?.doorOptions) return null;
  const p = mPointToPx(door.doorOptions, layout);
  return { cx: p.x, cy: p.y, size: fixtureGrabPx(layout) };
}

function hitDoorOptionsHandle(door, layout, raw) {
  const handle = doorOptionsHandlePx(door, layout);
  if (!handle) return null;
  if (Math.hypot(raw.x - handle.cx, raw.y - handle.cy) <= handle.size / 2 + 5) {
    return { type: "door-options", kind: "rotate" };
  }
  return null;
}

function fixtureRotateHandlePx(rect, layout) {
  const s = mRectToPx(rect, layout);
  const hs = fixtureGrabPx(layout);
  const pad = 2;
  return { cx: s.x + s.w - pad - hs / 2, cy: s.y + pad + hs / 2, size: hs };
}

function hitShowerRotateHandle(shower, layout, raw) {
  if (!shower) return null;
  const { cx, cy, size } = fixtureRotateHandlePx(shower, layout);
  const half = size / 2 + 4;
  if (raw.x >= cx - half && raw.x <= cx + half && raw.y >= cy - half && raw.y <= cy + half) {
    return { type: "shower-rotate", kind: "rotate" };
  }
  return null;
}

function showerRotOf(room) {
  const n = Number(room?.showerRot);
  if (n === 0 || n === 1 || n === 2 || n === 3) return n;
  if (room?.showerLongIsX === true) return 0;
  if (room?.showerLongIsX === false) return 1;
  return room.h >= room.w ? 1 : 0;
}

function showerLongAxis(room) {
  return showerRotOf(room) % 2 === 0;
}

function showerResizeHandles(shower, room) {
  if (!shower) return [];
  const longIsX = showerLongAxis(room);
  if (longIsX) {
    const y = shower.y + shower.h / 2;
    return [
      { which: "start", point: { x: shower.x, y } },
      { which: "end", point: { x: shower.x + shower.w, y } },
    ];
  }
  const x = shower.x + shower.w / 2;
  return [
    { which: "start", point: { x, y: shower.y } },
    { which: "end", point: { x, y: shower.y + shower.h } },
  ];
}

function hitShowerResizeHandle(shower, room, layout, raw) {
  if (!shower) return null;
  const hs = fixtureGrabPx(layout);
  const hitR = hs / 2 + 5;
  let best = null;
  for (const h of showerResizeHandles(shower, room)) {
    const px = mPointToPx(h.point, layout);
    const d = Math.hypot(raw.x - px.x, raw.y - px.y);
    if (d <= hitR && (!best || d < best.d)) best = { which: h.which, d };
  }
  if (!best) return null;
  return {
    type: "shower-resize",
    kind: showerLongAxis(room) ? "ew" : "ns",
    which: best.which,
  };
}

function startShowerResizeDrag(room, which, cursorM) {
  const { shower } = bathroomFixtures(room);
  if (!shower) return { mode: "shower-resize", which, grab: 0 };
  const longIsX = showerLongAxis(room);
  const edge =
    which === "start"
      ? longIsX
        ? shower.x
        : shower.y
      : longIsX
        ? shower.x + shower.w
        : shower.y + shower.h;
  const cursor = longIsX ? cursorM.x : cursorM.y;
  return { mode: "shower-resize", which, grab: cursor - edge };
}

function moveShowerLength(room, which, cursorM, grab) {
  const { shower } = bathroomFixtures(room);
  if (!shower) return room;
  const longIsX = showerLongAxis(room);
  const room0 = longIsX ? room.x : room.y;
  const span = longIsX ? room.w : room.h;
  const room1 = room0 + span;
  const { min, max } = showerLenLimits(span);
  const cross = longIsX ? shower.y : shower.x;
  const start0 = longIsX ? shower.x : shower.y;
  const end0 = start0 + (longIsX ? shower.w : shower.h);
  const cursor = (longIsX ? cursorM.x : cursorM.y) - (Number.isFinite(grab) ? grab : 0);
  let start = start0;
  let end = end0;
  if (which === "start") {
    const minStart = Math.max(room0, end0 - max);
    const maxStart = end0 - min;
    start = snapPlanMm(Math.max(minStart, Math.min(maxStart, cursor)));
    end = end0;
  } else {
    const minEnd = start0 + min;
    const maxEnd = Math.min(room1, start0 + max);
    end = snapPlanMm(Math.max(minEnd, Math.min(maxEnd, cursor)));
    start = start0;
  }
  const length = showerLengthM({ showerLen: end - start }, span);
  const posAlong = which === "start" ? end - length : start;
  const posX = longIsX ? posAlong : cross;
  const posY = longIsX ? cross : posAlong;
  return {
    ...room,
    showerLen: length,
    showerRot: showerRotOf(room),
    showerLongIsX: longIsX,
    showerX: snapPlanMm(posX - room.x),
    showerY: snapPlanMm(posY - room.y),
  };
}

function showerGlassPlacement(rect, rot, flip) {
  const r = ((Number(rot) % 4) + 4) % 4;
  const len = Math.min(0.9, r % 2 === 0 ? rect.w : rect.h);
  const panel = 0.05;
  const headAtMax = r === 2 || r === 3;
  const t0 = headAtMax ? (r % 2 === 0 ? rect.x + rect.w : rect.y + rect.h) - len : r % 2 === 0 ? rect.x : rect.y;
  const t1 = t0 + len;
  const useMin = r === 0 || r === 3 ? !flip : flip;
  if (r % 2 === 0) {
    return {
      side: useMin ? "top" : "bottom",
      axis: "h",
      edge: useMin ? rect.y : rect.y + rect.h,
      t0,
      t1,
      glass: useMin
        ? { x: t0, y: rect.y, w: len, h: panel }
        : { x: t0, y: rect.y + rect.h - panel, w: len, h: panel },
    };
  }
  return {
    side: useMin ? "left" : "right",
    axis: "v",
    edge: useMin ? rect.x : rect.x + rect.w,
    t0,
    t1,
    glass: useMin
      ? { x: rect.x, y: t0, w: panel, h: len }
      : { x: rect.x + rect.w - panel, y: t0, w: panel, h: len },
  };
}

function showerEdgeOverlap(edge, axis, t0, t1, walls) {
  // Wall centreline sits ~50mm outside the room, and a quarter-turn can leave
  // the long side ~450mm off the wall it was sitting on. Still treat that as walled.
  const maxDist = 0.62;
  let total = 0;
  for (const wall of walls || []) {
    if (axis === "h") {
      if (wall.axis !== "h" || Math.abs(wall.y - edge) > maxDist) continue;
    } else if (wall.axis !== "v" || Math.abs(wall.x - edge) > maxDist) continue;
    const lo = Math.max(t0, Math.min(wall.t0, wall.t1));
    const hi = Math.min(t1, Math.max(wall.t0, wall.t1));
    if (hi > lo) total += hi - lo;
  }
  return total;
}

function showerGlassFlip(rect, rot, walls) {
  const primary = showerGlassPlacement(rect, rot, false);
  const r = ((Number(rot) % 4) + 4) % 4;
  const t0 = r % 2 === 0 ? rect.x : rect.y;
  const t1 = r % 2 === 0 ? rect.x + rect.w : rect.y + rect.h;
  const onWall = showerEdgeOverlap(primary.edge, primary.axis, t0, t1, walls);
  if (onWall < 0.2) return false;
  const alt = showerGlassPlacement(rect, rot, true);
  return showerEdgeOverlap(alt.edge, alt.axis, t0, t1, walls) < onWall;
}

/** Head at one end of the 1800 side. Glass runs 900mm from that end, on the long edge that is not an internal wall. */
function showerPlanParts(rect, rot, walls) {
  const r = ((Number(rot) % 4) + 4) % 4;
  const headInset = 0.16;
  const place = showerGlassPlacement(rect, rot, showerGlassFlip(rect, rot, walls));
  const head =
    r === 0
      ? { x: rect.x + headInset, y: rect.y + rect.h / 2 }
      : r === 1
        ? { x: rect.x + rect.w / 2, y: rect.y + headInset }
        : r === 2
          ? { x: rect.x + rect.w - headInset, y: rect.y + rect.h / 2 }
          : { x: rect.x + rect.w / 2, y: rect.y + rect.h - headInset };
  const aim =
    r === 0 ? { x: 1, y: 0 } : r === 1 ? { x: 0, y: 1 } : r === 2 ? { x: -1, y: 0 } : { x: 0, y: -1 };
  return { head, aim, glass: place.glass, side: place.side };
}

function glassPanelPx(glass, side, layout) {
  const g = mRectToPx(glass, layout);
  const min = 3;
  if (side === "top") return { ...g, h: Math.max(g.h, min) };
  if (side === "bottom") {
    const h = Math.max(g.h, min);
    return { ...g, y: g.y + g.h - h, h };
  }
  if (side === "left") return { ...g, w: Math.max(g.w, min) };
  const w = Math.max(g.w, min);
  return { ...g, x: g.x + g.w - w, w };
}

function rotateShower90(room) {
  const { shower } = bathroomFixtures(room);
  if (!shower) return room;
  const tol = 0.22;
  const leftGap = shower.x - room.x;
  const rightGap = room.x + room.w - (shower.x + shower.w);
  const topGap = shower.y - room.y;
  const botGap = room.y + room.h - (shower.y + shower.h);
  const nextW = shower.h;
  const nextH = shower.w;
  const touchL = leftGap <= tol;
  const touchR = rightGap <= tol;
  const touchT = topGap <= tol;
  const touchB = botGap <= tol;
  const x =
    touchL && !touchR
      ? room.x + leftGap
      : touchR && !touchL
        ? room.x + room.w - nextW - rightGap
        : shower.x + shower.w / 2 - nextW / 2;
  const y =
    touchT && !touchB
      ? room.y + topGap
      : touchB && !touchT
        ? room.y + room.h - nextH - botGap
        : shower.y + shower.h / 2 - nextH / 2;
  const nextRect = clampRectInRoom(room, { x, y, w: nextW, h: nextH });
  const showerRot = (showerRotOf(room) + 1) % 4;
  return {
    ...room,
    showerRot,
    showerLongIsX: showerRot % 2 === 0,
    showerX: snapPlanMm(nextRect.x - room.x),
    showerY: snapPlanMm(nextRect.y - room.y),
  };
}

/** Uncut partition walls (before bedroom door openings). */
function partitionWallsUncut(rooms, innerMetres) {
  const innerEdges = outlineAxisEdges(innerMetres);
  const raw = [];
  const probeM = PARTITION_MERGE_PROBE_M;
  const matchM = PARTITION_MERGE_PROBE_M;
  for (const room of rooms || []) {
    if (!roomNeedsPartitionWalls(room)) continue;
    const half = WALL_THICKNESS_M / 2;
    const x0 = room.x;
    const y0 = room.y;
    const x1 = room.x + room.w;
    const y1 = room.y + room.h;
    const sides = [
      { name: "top", axis: "h", y: y0, t0: x0 - half, t1: x1 + half, ox: 0, oy: -1 },
      { name: "bottom", axis: "h", y: y1, t0: x0 - half, t1: x1 + half, ox: 0, oy: 1 },
      { name: "left", axis: "v", x: x0, t0: y0 - half, t1: y1 + half, ox: -1, oy: 0 },
      { name: "right", axis: "v", x: x1, t0: y0 - half, t1: y1 + half, ox: 1, oy: 0 },
    ];
    const openSide = isLaundry(room) ? laundryOpenSide(room) : null;
    for (const side of sides) {
      if (side.name === openSide) continue;
      const cuts = externalCutsOnSide(side, innerMetres, probeM);
      for (const ie of innerEdges) {
        if (side.axis === "h" && ie.axis === "h" && almostEqualM(side.y, ie.y, matchM)) {
          const lo = Math.max(side.t0, ie.t0);
          const hi = Math.min(side.t1, ie.t1);
          if (hi - lo > WALL_MIN_LEN_M) cuts.push([lo, hi]);
        } else if (side.axis === "v" && ie.axis === "v" && almostEqualM(side.x, ie.x, matchM)) {
          const lo = Math.max(side.t0, ie.t0);
          const hi = Math.min(side.t1, ie.t1);
          if (hi - lo > WALL_MIN_LEN_M) cuts.push([lo, hi]);
        }
      }
      for (const [t0, t1] of subtractIntervals(side.t0, side.t1, cuts)) {
        if (side.axis === "h") raw.push({ axis: "h", y: roundMm(side.y + side.oy * half), t0, t1 });
        else raw.push({ axis: "v", x: roundMm(side.x + side.ox * half), t0, t1 });
      }
    }
  }
  return mergePartitionWalls(raw);
}

function roomPartitionSides(room, innerMetres) {
  const sides = { top: false, bottom: false, left: false, right: false };
  if (!room) return sides;
  const walls = partitionWallsUncut([room], innerMetres);
  const matchM = WALL_THICKNESS_M + 0.08;
  for (const w of walls) {
    if (w.axis === "h") {
      if (almostEqualM(w.y, room.y, matchM)) sides.top = true;
      if (almostEqualM(w.y, room.y + room.h, matchM)) sides.bottom = true;
    } else {
      if (almostEqualM(w.x, room.x, matchM)) sides.left = true;
      if (almostEqualM(w.x, room.x + room.w, matchM)) sides.right = true;
    }
  }
  return sides;
}

function bedroomEntrySide(room, innerMetres) {
  const sides = roomPartitionSides(room, innerMetres);
  for (const side of ["top", "right", "bottom", "left"]) {
    if (sides[side]) return side;
  }
  return room.w >= room.h ? "top" : "left";
}

function roomDoorSideIsExternal(room, side, innerMetres) {
  if (!room || !innerMetres?.length) return false;
  const frame = roomWallFrame(room, side);
  const mid = {
    x: frame.origin.x + frame.along.x * (frame.wallLen / 2),
    y: frame.origin.y + frame.along.y * (frame.wallLen / 2),
  };
  const outward = {
    x: mid.x - frame.inward.x * PARTITION_MERGE_PROBE_M,
    y: mid.y - frame.inward.y * PARTITION_MERGE_PROBE_M,
  };
  if (!pointInPolygon(outward, innerMetres)) return true;
  return distPointToPolygon(mid, innerMetres) <= PARTITION_MERGE_PROBE_M;
}

function roomDoorSwing(room, innerMetres) {
  const kind = roomKind(room);
  if (!room || (kind !== "bedroom" && kind !== "bathroom" && kind !== "powder" && kind !== "laundryRoom")) {
    return null;
  }
  const doorSide = roomDoorSide(room, innerMetres);
  const frame = roomWallFrame(room, doorSide);
  return doorSwingOnFrame(room, frame, doorSide);
}

function distPointToSeg(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-18) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}

function distPointToPolygon(p, pts) {
  if (!pts?.length) return Infinity;
  let best = Infinity;
  for (let i = 0; i < pts.length; i += 1) {
    best = Math.min(best, distPointToSeg(p, pts[i], pts[(i + 1) % pts.length]));
  }
  return best;
}

function porchAttachSide(porch, metres) {
  if (!porch || !metres?.length) return null;
  const probes = [
    { side: "top", p: { x: porch.x + porch.w / 2, y: porch.y - 0.08 } },
    { side: "right", p: { x: porch.x + porch.w + 0.08, y: porch.y + porch.h / 2 } },
    { side: "bottom", p: { x: porch.x + porch.w / 2, y: porch.y + porch.h + 0.08 } },
    { side: "left", p: { x: porch.x - 0.08, y: porch.y + porch.h / 2 } },
  ];
  for (const { side, p } of probes) {
    if (pointInOrOnPolygon(p, metres)) return side;
  }
  let best = probes[0];
  let bestD = Infinity;
  for (const item of probes) {
    const d = distPointToPolygon(item.p, metres);
    if (d < bestD) {
      bestD = d;
      best = item;
    }
  }
  return best.side;
}

function porchMinAlong(depth) {
  const d = Number(depth) || 0;
  if (Math.abs(d - PORCH_H_M) <= Math.abs(d - PORCH_W_M)) return PORCH_W_M;
  return PORCH_H_M;
}

function exteriorPerimeter(metres) {
  const edges = [];
  let s = 0;
  const n = metres?.length || 0;
  for (let i = 0; i < n; i += 1) {
    const a = metres[i];
    const b = metres[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 0.04) continue;
    const inward = polygonEdgeInwardNormal(metres, a, b);
    edges.push({
      a,
      b,
      len,
      s0: s,
      s1: s + len,
      along: { x: (b.x - a.x) / len, y: (b.y - a.y) / len },
      out: { x: -inward.nx, y: -inward.ny },
    });
    s += len;
  }
  return { edges, total: s };
}

function unwrapNear(s, target, total) {
  if (!(total > 0)) return s;
  let u = s;
  while (u - target > total / 2) u -= total;
  while (target - u > total / 2) u += total;
  return u;
}

function projectToPerimeter(peri, point) {
  let best = null;
  for (const edge of peri.edges) {
    const relx = point.x - edge.a.x;
    const rely = point.y - edge.a.y;
    const t = Math.max(0, Math.min(edge.len, relx * edge.along.x + rely * edge.along.y));
    const q = { x: edge.a.x + edge.along.x * t, y: edge.a.y + edge.along.y * t };
    const d = Math.hypot(point.x - q.x, point.y - q.y);
    if (!best || d < best.d) best = { d, s: edge.s0 + t };
  }
  return best;
}

function pointOnPerimeter(peri, s) {
  if (!peri.total) return null;
  let u = s % peri.total;
  if (u < 0) u += peri.total;
  for (const edge of peri.edges) {
    if (u <= edge.s1 + 1e-6) {
      const t = Math.max(0, u - edge.s0);
      return {
        x: edge.a.x + edge.along.x * t,
        y: edge.a.y + edge.along.y * t,
        out: edge.out,
        along: edge.along,
        edge,
      };
    }
  }
  const edge = peri.edges[peri.edges.length - 1];
  return { x: edge.b.x, y: edge.b.y, out: edge.out, along: edge.along, edge };
}

function porchWallEnds(room, metres) {
  const side = porchAttachSide(room, metres);
  if (side === "bottom") {
    return [
      { x: room.x, y: room.y + room.h },
      { x: room.x + room.w, y: room.y + room.h },
    ];
  }
  if (side === "left") {
    return [
      { x: room.x, y: room.y },
      { x: room.x, y: room.y + room.h },
    ];
  }
  if (side === "right") {
    return [
      { x: room.x + room.w, y: room.y },
      { x: room.x + room.w, y: room.y + room.h },
    ];
  }
  return [
    { x: room.x, y: room.y },
    { x: room.x + room.w, y: room.y },
  ];
}

function porchDepthFromRect(room, metres) {
  const side = porchAttachSide(room, metres);
  return side === "left" || side === "right" ? room.w : room.h;
}

function porchRunFromRect(room, metres) {
  const peri = exteriorPerimeter(metres);
  if (!(peri.total > 0)) return null;
  const ends = porchWallEnds(room, metres);
  const a = projectToPerimeter(peri, ends[0]);
  const b = projectToPerimeter(peri, ends[1]);
  if (!a || !b) return null;
  let forward = b.s - a.s;
  if (forward < 0) forward += peri.total;
  const back = peri.total - forward;
  const depth = Math.max(0.4, porchDepthFromRect(room, metres));
  const minLength = porchMinAlong(depth);
  if (back < forward) {
    return { s0: b.s, length: Math.max(minLength, back), depth, minLength };
  }
  return { s0: a.s, length: Math.max(minLength, forward), depth, minLength };
}

function ensurePorchRun(room, metres) {
  if (room?.porchRun && room.porchRun.length > 0.05 && room.porchRun.depth > 0.05) return room.porchRun;
  return porchRunFromRect(room, metres);
}

function extrudedLeg(edge, t0, t1, depth) {
  const p0 = { x: edge.a.x + edge.along.x * t0, y: edge.a.y + edge.along.y * t0 };
  const p1 = { x: edge.a.x + edge.along.x * t1, y: edge.a.y + edge.along.y * t1 };
  const pts = [
    p0,
    p1,
    { x: p1.x + edge.out.x * depth, y: p1.y + edge.out.y * depth },
    { x: p0.x + edge.out.x * depth, y: p0.y + edge.out.y * depth },
  ];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

function cornerPadRect(edge, next, depth) {
  const cross = edge.out.x * next.out.y - edge.out.y * next.out.x;
  if (Math.abs(cross) < 0.2) return null;
  const c = edge.b;
  const pts = [
    c,
    { x: c.x + edge.out.x * depth, y: c.y + edge.out.y * depth },
    { x: c.x + next.out.x * depth, y: c.y + next.out.y * depth },
    {
      x: c.x + (edge.out.x + next.out.x) * depth,
      y: c.y + (edge.out.y + next.out.y) * depth,
    },
  ];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

function porchLegsFromRun(metres, run) {
  const peri = exteriorPerimeter(metres);
  if (!peri.total || !(run?.length > 0.05) || !(run.depth > 0.05)) return [];
  const s0 = run.s0;
  const s1 = run.s0 + run.length;
  const legs = [];
  for (const edge of peri.edges) {
    for (const shift of [-peri.total, 0, peri.total]) {
      const a = Math.max(s0, edge.s0 + shift);
      const b = Math.min(s1, edge.s1 + shift);
      if (b - a < 0.03) continue;
      legs.push(extrudedLeg(edge, a - (edge.s0 + shift), b - (edge.s0 + shift), run.depth));
    }
  }
  for (let i = 0; i < peri.edges.length; i += 1) {
    const edge = peri.edges[i];
    const next = peri.edges[(i + 1) % peri.edges.length];
    for (const vs of [edge.s1 - peri.total, edge.s1, edge.s1 + peri.total]) {
      if (!(s0 < vs - 0.02 && s1 > vs + 0.02)) continue;
      const pad = cornerPadRect(edge, next, run.depth);
      if (pad && pad.w > 0.03 && pad.h > 0.03) legs.push(pad);
    }
  }
  return legs.filter((r) => r.w > 0.03 && r.h > 0.03);
}

function porchFootprints(room) {
  if (room?.porchParts?.length) return room.porchParts;
  if (room && room.w > 0 && room.h > 0) return [room];
  return [];
}

function porchPrimaryLeg(room) {
  const parts = porchFootprints(room);
  if (!parts.length) return room;
  const depth = room?.porchRun?.depth;
  const spans = parts.filter((p) => {
    if (!(depth > 0) || parts.length < 2) return true;
    return Math.abs(p.w - depth) > 0.08 || Math.abs(p.h - depth) > 0.08;
  });
  const list = spans.length ? spans : parts;
  return list.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0];
}

function porchHostRect(room, metres) {
  if (!room?.porchRun) return room;
  const leg = porchPrimaryLeg(room);
  if (!leg) return room;
  return { ...room, x: leg.x, y: leg.y, w: leg.w, h: leg.h, porchRun: null, porchParts: null };
}

function applyPorchRun(room, run, metres) {
  const minLength = run.minLength > 0.05 ? run.minLength : porchMinAlong(run.depth);
  let length = Math.max(minLength, run.length);
  const peri = exteriorPerimeter(metres);
  if (peri.total > minLength + 0.5) length = Math.min(length, peri.total - 0.4);
  const nextRun = { s0: run.s0, length, depth: run.depth, minLength };
  const parts = porchLegsFromRun(metres, nextRun);
  if (!parts.length) return room;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const part of parts) {
    minX = Math.min(minX, part.x);
    minY = Math.min(minY, part.y);
    maxX = Math.max(maxX, part.x + part.w);
    maxY = Math.max(maxY, part.y + part.h);
  }
  const host = parts.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0];
  return {
    ...room,
    porchRun: nextRun,
    porchParts: parts,
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
    layoutLongIsX: host.w >= host.h,
  };
}

function collapsePorch(room, metres) {
  if (!room?.porchRun) return room;
  const leg = porchPrimaryLeg(room) || room;
  return {
    ...room,
    x: leg.x,
    y: leg.y,
    w: leg.w,
    h: leg.h,
    porchRun: null,
    porchParts: null,
    layoutLongIsX: leg.w >= leg.h,
  };
}

function porchResizeHandles(room, metres) {
  const run = ensurePorchRun(room, metres);
  const peri = exteriorPerimeter(metres);
  if (!run || !peri.total) return [];
  return ["start", "end"].map((which) => {
    const at = pointOnPerimeter(peri, which === "start" ? run.s0 : run.s0 + run.length);
    if (!at) return null;
    return {
      which,
      axis: Math.abs(at.along.x) > 0.5 ? "ew" : "ns",
      point: {
        x: at.x + at.out.x * run.depth * 0.5,
        y: at.y + at.out.y * run.depth * 0.5,
      },
    };
  }).filter(Boolean);
}

function hitPorchResizeHandle(room, layout, raw, metres) {
  const hs = fixtureGrabPx(layout);
  const hitR = hs / 2 + 6;
  let best = null;
  for (const h of porchResizeHandles(room, metres)) {
    const px = mPointToPx(h.point, layout);
    const d = Math.hypot(raw.x - px.x, raw.y - px.y);
    if (d <= hitR && (!best || d < best.d)) best = { ...h, d };
  }
  if (!best) return null;
  return { type: "porch-resize", kind: best.axis, which: best.which };
}

function startPorchResize(room, which, cursorM, metres) {
  const run = ensurePorchRun(room, metres);
  const peri = exteriorPerimeter(metres);
  const endS = which === "start" ? run.s0 : run.s0 + run.length;
  const hit = projectToPerimeter(peri, cursorM);
  const hitU = hit ? unwrapNear(hit.s, endS, peri.total) : endS;
  return { which, grabAlong: hitU - endS };
}

function resizePorchEnd(room, which, cursorM, grabAlong, metres) {
  const run = ensurePorchRun(room, metres);
  const peri = exteriorPerimeter(metres);
  if (!run || !peri.total) return room;
  const endS = which === "start" ? run.s0 : run.s0 + run.length;
  const hit = projectToPerimeter(peri, cursorM);
  if (!hit) return room;
  const s = snapPlanMm(unwrapNear(hit.s, endS, peri.total) - (Number.isFinite(grabAlong) ? grabAlong : 0));
  const minLen = run.minLength > 0.05 ? run.minLength : porchMinAlong(run.depth);
  const maxLen = peri.total > minLen + 0.5 ? peri.total - 0.4 : Math.max(minLen, run.length);
  const kept = { depth: run.depth, minLength: minLen };
  if (which === "start") {
    const fixed = run.s0 + run.length;
    const length = Math.max(minLen, Math.min(maxLen, fixed - s));
    return applyPorchRun(room, { ...kept, s0: fixed - length, length }, metres);
  }
  const length = Math.max(minLen, Math.min(maxLen, s - run.s0));
  return applyPorchRun(room, { ...kept, s0: run.s0, length }, metres);
}

function slidePorch(room, cursorM, grabM, metres) {
  const run = ensurePorchRun(room, metres);
  const peri = exteriorPerimeter(metres);
  if (!run || !peri.total) return room;
  const a = projectToPerimeter(peri, grabM);
  const b = projectToPerimeter(peri, cursorM);
  if (!a || !b) return room;
  const delta = snapPlanMm(unwrapNear(b.s, a.s, peri.total) - a.s);
  return applyPorchRun(room, { ...run, s0: run.s0 + delta }, metres);
}

function doorSwingOnFrame(room, frame, doorSide, { center = false } = {}) {
  const doorWidth = Math.min(roomDoorWidthM(room), Math.max(0.2, frame.wallLen - 0.05));
  const maxAlong = Math.max(0, frame.wallLen - doorWidth);
  const storedAlong = Number(room?.doorAlong);
  const doorAlong = Number.isFinite(storedAlong)
    ? Math.max(0, Math.min(maxAlong, storedAlong))
    : center
      ? Math.max(0, maxAlong / 2)
      : 0;
  const flipped = Boolean(room?.doorFlip);
  const openingStart = {
    x: frame.origin.x + frame.along.x * doorAlong,
    y: frame.origin.y + frame.along.y * doorAlong,
  };
  const openingEnd = {
    x: openingStart.x + frame.along.x * doorWidth,
    y: openingStart.y + frame.along.y * doorWidth,
  };
  const hinge = flipped ? openingEnd : openingStart;
  const closed = flipped ? openingStart : openingEnd;
  const open = {
    x: hinge.x + frame.inward.x * doorWidth,
    y: hinge.y + frame.inward.y * doorWidth,
  };
  const cut = {
    axis: doorSide === "top" || doorSide === "bottom" ? "h" : "v",
    pos: doorSide === "top" || doorSide === "bottom" ? frame.origin.y : frame.origin.x,
    t0: doorSide === "top" || doorSide === "bottom" ? openingStart.x : openingStart.y,
  };
  cut.t1 = cut.t0 + doorWidth;
  const leafAlong = flipped
    ? { x: -frame.along.x, y: -frame.along.y }
    : frame.along;
  const cross = leafAlong.x * frame.inward.y - leafAlong.y * frame.inward.x;
  const sliding = Boolean(room?.doorSlide);
  const pocketDir = flipped ? frame.along : { x: -frame.along.x, y: -frame.along.y };
  const intoOpen = { x: -pocketDir.x, y: -pocketDir.y };
  const jamb = flipped ? openingEnd : openingStart;
  const neededPocket = Math.max(0, doorWidth - SLIDER_PROTRUDE_M);
  const available = flipped
    ? Math.max(0, frame.wallLen - doorAlong - doorWidth)
    : Math.max(0, doorAlong);
  const pocket = Math.min(neededPocket, available);
  const show = Math.max(0.02, doorWidth - pocket);
  const lead = { x: jamb.x + intoOpen.x * show, y: jamb.y + intoOpen.y * show };
  const tail = { x: lead.x + pocketDir.x * doorWidth, y: lead.y + pocketDir.y * doorWidth };
  const cavityFar = {
    x: jamb.x + pocketDir.x * pocket,
    y: jamb.y + pocketDir.y * pocket,
  };
  const out = { x: -frame.inward.x, y: -frame.inward.y };
  const edgeQuad = (a, b, t0, t1) => {
    const at = (pt, t) => ({ x: pt.x + out.x * t, y: pt.y + out.y * t });
    return [at(a, t0), at(b, t0), at(b, t1), at(a, t1)];
  };
  const leafInset = Math.max(0, (WALL_THICKNESS_M - DOOR_LEAF_T_M) / 2);
  return {
    doorSide,
    doorWidth,
    hinge,
    closed,
    open,
    along: frame.along,
    inward: frame.inward,
    openingStart,
    flipped,
    cw: cross > 0,
    cut,
    sliding,
    slideTail: tail,
    slideLead: lead,
    cavityQuad: edgeQuad(jamb, cavityFar, 0, WALL_THICKNESS_M),
    leafQuad: edgeQuad(tail, lead, leafInset, leafInset + DOOR_LEAF_T_M),
    doorGrab: {
      x: (Math.min(hinge.x, closed.x, open.x) + Math.max(hinge.x, closed.x, open.x)) / 2,
      y: (Math.min(hinge.y, closed.y, open.y) + Math.max(hinge.y, closed.y, open.y)) / 2,
    },
    doorLabel: {
      x: openingStart.x + frame.along.x * (doorWidth / 2) + frame.inward.x * 0.22,
      y: openingStart.y + frame.along.y * (doorWidth / 2) + frame.inward.y * 0.22,
    },
    doorOptions: {
      x: (flipped ? openingStart : openingEnd).x + frame.inward.x * 0.36,
      y: (flipped ? openingStart : openingEnd).y + frame.inward.y * 0.36,
    },
  };
}

const PORCH_STEP_COUNT = 3;
const PORCH_STEP_GOING_M = 0.28;

function porchSideClockwise(side) {
  if (side === "top") return "right";
  if (side === "right") return "bottom";
  if (side === "bottom") return "left";
  return "top";
}

/** End, then the outer side, then the other end. The door side is left out. */
function porchNonDoorSides(doorSide) {
  const end = porchSideClockwise(doorSide);
  const outer = porchSideClockwise(end);
  return [end, outer, porchSideClockwise(outer)];
}

function porchActiveStepSide(room, metres) {
  const host = porchHostRect(room, metres);
  const doorSide = porchAttachSide(host, metres);
  const sides = porchNonDoorSides(doorSide || "top");
  const idx = room?.porchStepIndex === 1 || room?.porchStepIndex === 2 ? room.porchStepIndex : 0;
  return { host, doorSide, side: sides[idx], sides };
}

function rectFromCorners(pts) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

function porchStepFlight(room, metres) {
  const { host, side } = porchActiveStepSide(room, metres);
  if (!host || !side || !(host.w > 0.05) || !(host.h > 0.05)) return [];
  const frame = roomWallFrame(host, side);
  if (!(frame.wallLen > 0.2)) return [];
  const out = { x: -frame.inward.x, y: -frame.inward.y };
  const going = PORCH_STEP_GOING_M;
  const rects = [];
  for (let i = 0; i < PORCH_STEP_COUNT; i += 1) {
    const d0 = i * going;
    const o0 = {
      x: frame.origin.x + out.x * d0,
      y: frame.origin.y + out.y * d0,
    };
    const o1 = {
      x: o0.x + frame.along.x * frame.wallLen,
      y: o0.y + frame.along.y * frame.wallLen,
    };
    const o2 = { x: o1.x + out.x * going, y: o1.y + out.y * going };
    const o3 = { x: o0.x + out.x * going, y: o0.y + out.y * going };
    rects.push({ ...rectFromCorners([o0, o1, o2, o3]), i });
  }
  return rects;
}

function cyclePorchSteps(room) {
  const idx = room?.porchStepIndex === 1 || room?.porchStepIndex === 2 ? room.porchStepIndex : 0;
  return { ...room, porchStepIndex: (idx + 1) % 3 };
}

function porchStepOptionsPoint(room, metres) {
  const { host, side } = porchActiveStepSide(room, metres);
  if (!host || !side) return null;
  const frame = roomWallFrame(host, side);
  const depth = side === "top" || side === "bottom" ? host.h : host.w;
  const inset = Math.min(0.45, Math.max(0.28, depth * 0.32));
  return {
    x: frame.origin.x + frame.along.x * (frame.wallLen / 2) + frame.inward.x * inset,
    y: frame.origin.y + frame.along.y * (frame.wallLen / 2) + frame.inward.y * inset,
  };
}

function porchStepOptionsPx(room, layout, metres) {
  const point = porchStepOptionsPoint(room, metres);
  if (!point) return null;
  const p = mPointToPx(point, layout);
  return { cx: p.x, cy: p.y, size: fixtureGrabPx(layout) };
}

function roomsWithPorchSteps(rooms, metres) {
  return (rooms || []).map((room) => {
    if (roomKind(room) !== "porch") return room;
    return { ...room, porchStepRects: porchStepFlight(room, metres) };
  });
}

function walkDoorFrame(rooms, metres, innerMetres) {
  const door = (collectDesignDoors(rooms, metres, innerMetres || metres) || []).find(
    (d) => d.external && d.inward && d.hinge && d.closed
  );
  if (!door) return null;
  const mx = (door.hinge.x + door.closed.x) / 2;
  const my = (door.hinge.y + door.closed.y) / 2;
  let ox = -(door.inward.x || 0);
  let oy = -(door.inward.y || 0);
  const len = Math.hypot(ox, oy) || 1;
  return { mx, my, ox: ox / len, oy: oy / len };
}

function defaultWalkStartMetres(rooms, metres, innerMetres) {
  const frame = walkDoorFrame(rooms, metres, innerMetres);
  if (frame) return { x: frame.mx + frame.ox * 10, y: frame.my + frame.oy * 10 };
  if (!metres?.length) return null;
  let sx = 0;
  let sy = 0;
  for (const p of metres) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / metres.length, y: sy / metres.length + 10 };
}

function nextWalkLocationMetres(start, locations, frame) {
  const prev = locations?.length ? locations[locations.length - 1] : start;
  if (!prev) return null;
  const ox = frame?.ox || 0;
  const oy = frame?.oy || -1;
  return {
    x: snapMetresToStep(prev.x - ox * 3),
    y: snapMetresToStep(prev.y - oy * 3),
  };
}

function defaultWalkFinishMetres(rooms, metres, innerMetres, start) {
  const frame = walkDoorFrame(rooms, metres, innerMetres);
  if (frame) {
    return {
      x: snapMetresToStep(frame.mx + frame.ox * 2.5),
      y: snapMetresToStep(frame.my + frame.oy * 2.5),
    };
  }
  if (!start) return null;
  return { x: snapMetresToStep(start.x), y: snapMetresToStep(start.y - 4) };
}

function porchFrontDoor(porch, metres) {
  if (!porch || roomKind(porch) !== "porch") return null;
  const host = porchHostRect(porch, metres);
  const doorSide = porchAttachSide(host, metres);
  if (!doorSide) return null;
  const porchFrame = roomWallFrame(host, doorSide);
  const frame = {
    ...porchFrame,
    inward: { x: -porchFrame.inward.x, y: -porchFrame.inward.y },
  };
  return doorSwingOnFrame(host, frame, doorSide, { center: true });
}

function collectDesignDoors(rooms, metres, innerMetres) {
  const doors = [];
  for (const room of rooms || []) {
    if (isPorch(room)) {
      const geom = porchFrontDoor(room, metres);
      if (geom) doors.push({ ...geom, external: true });
    } else {
      const geom = roomDoorSwing(room, innerMetres);
      if (geom) doors.push({ ...geom, external: false });
    }
  }
  return doors;
}

function porchFrontDoorOpening(door) {
  if (!door?.hinge || !door?.closed || !door?.inward) return null;
  const pad = 0.02;
  const back = pad;
  const through = WALL_THICKNESS_M + pad;
  const { hinge, closed, inward } = door;
  const pts = [
    { x: hinge.x - inward.x * back, y: hinge.y - inward.y * back },
    { x: closed.x - inward.x * back, y: closed.y - inward.y * back },
    { x: closed.x + inward.x * through, y: closed.y + inward.y * through },
    { x: hinge.x + inward.x * through, y: hinge.y + inward.y * through },
  ];
  return {
    pts,
    jambs: [
      [pts[0], pts[3]],
      [pts[1], pts[2]],
    ],
  };
}

function defaultVanityPlacement(room, doorSide) {
  const longSides = room.h >= room.w ? ["left", "right"] : ["top", "bottom"];
  const side = longSides.find((s) => s !== doorSide) || longSides[0] || "left";
  const frame = roomWallFrame(room, side);
  const len = Math.min(vanityLengthM(room), Math.max(0.2, frame.wallLen - 0.05));
  return { side, along: Math.max(0, (frame.wallLen - len) / 2) };
}

function vanityWmSide(room) {
  return room?.vanityWm === "left" || room?.vanityWm === "right" ? room.vanityWm : null;
}

/** Step to the next vanity option, skipping washing machine sides that don't fit. */
function cycleVanityWm(room, innerMetres) {
  const order = [null, "left", "right"];
  const i = order.indexOf(vanityWmSide(room));
  for (let k = 1; k < order.length; k += 1) {
    const opt = order[(i + k) % order.length];
    if (opt === null) return { ...room, vanityWm: null };
    const placed = placeVanityWm({ ...room, vanityWm: opt }, innerMetres, "butt");
    if (placed) return placed;
  }
  return { ...room, vanityWm: null };
}

/**
 * Along-wall limits for the vanity start, leaving room for the washing machine space.
 * Left/right are as seen standing in the room facing the vanity.
 */
function vanityAlongRange(room, frame, length) {
  const wm = vanityWmSide(room);
  let atStart = false;
  let atEnd = false;
  if (wm) {
    const alongIsRight = frame.along.x * frame.inward.y - frame.along.y * frame.inward.x > 0;
    atEnd = (wm === "right") === alongIsRight;
    atStart = !atEnd;
  }
  const startFace = 0;
  const endFace = frame.wallLen;
  const min = atStart ? startFace + WM_SPACE_M : 0;
  const max = Math.max(min, (atEnd ? endFace - WM_SPACE_M : frame.wallLen) - length);
  return { min, max, atStart, atEnd, butt: atEnd ? max : atStart ? min : null };
}

function bathroomVanity(room, innerMetres) {
  if (!room || !isBathLike(room)) return null;
  const def = defaultVanityPlacement(room, roomDoorSide(room, innerMetres));
  const stored = room?.vanitySide;
  const vanitySide =
    stored === "top" || stored === "right" || stored === "bottom" || stored === "left"
      ? stored
      : def.side;
  const frame = roomWallFrame(room, vanitySide);
  const length = Math.min(vanityLengthM(room), Math.max(0.2, frame.wallLen - 0.05));
  const roomDepth = vanitySide === "left" || vanitySide === "right" ? room.w : room.h;
  const fullDepth = roomKind(room) === "powder" ? POWDER_VANITY_DEPTH_M : VANITY_DEPTH_M;
  const depth = Math.min(fullDepth, Math.max(0.15, roomDepth - 0.05));
  const range = vanityAlongRange(room, frame, length, innerMetres);
  const storedAlong = Number(room?.vanityAlong);
  const alongM = Math.max(
    range.min,
    Math.min(range.max, Number.isFinite(storedAlong) ? storedAlong : def.along)
  );
  let wm = null;
  if (range.atStart || range.atEnd) {
    const t0 = range.atEnd ? alongM + length + WM_GAP_M : alongM - WM_GAP_M - WM_SIZE_M;
    const wmDepth = Math.min(WM_SIZE_M, Math.max(0.15, roomDepth - 0.05));
    wm = {
      rect: wallBoxRect(frame.origin, frame.along, frame.inward, t0, t0 + WM_SIZE_M, 0, wmDepth),
      zone: wallBoxRect(
        frame.origin,
        frame.along,
        frame.inward,
        t0 - WM_GAP_M,
        t0 + WM_SIZE_M + WM_GAP_M,
        0,
        wmDepth
      ),
    };
  }
  const anchor = {
    x: frame.origin.x + frame.along.x * alongM,
    y: frame.origin.y + frame.along.y * alongM,
  };
  const end = {
    x: anchor.x + frame.along.x * length,
    y: anchor.y + frame.along.y * length,
  };
  const innerA = {
    x: anchor.x + frame.inward.x * depth,
    y: anchor.y + frame.inward.y * depth,
  };
  const innerB = {
    x: end.x + frame.inward.x * depth,
    y: end.y + frame.inward.y * depth,
  };
  const xs = [anchor.x, end.x, innerA.x, innerB.x];
  const ys = [anchor.y, end.y, innerA.y, innerB.y];
  const rect = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
  const basinAlong0 = length * 0.22;
  const basinAlong1 = length * 0.78;
  const basinD0 = depth * 0.1;
  const basinD1 = depth * 0.9;
  const basin = wallBoxRect(anchor, frame.along, frame.inward, basinAlong0, basinAlong1, basinD0, basinD1);
  return {
    vanitySide,
    length,
    depth,
    along: frame.along,
    inward: frame.inward,
    alongM,
    anchor,
    end,
    innerA,
    innerB,
    rect,
    basin,
    wm,
    grab: rectCenter(rect),
    label: {
      x: rect.x + rect.w / 2 - frame.inward.x * 0.02,
      y: rect.y + rect.h / 2 - frame.inward.y * 0.02,
      vertical: vanitySide === "left" || vanitySide === "right",
    },
    sizeLabel: {
      x: (innerA.x + innerB.x) / 2 + frame.inward.x * 0.16,
      y: (innerA.y + innerB.y) / 2 + frame.inward.y * 0.16,
    },
  };
}

function wallBoxRect(origin, along, inward, t0, t1, d0, d1) {
  const pts = [
    { x: origin.x + along.x * t0 + inward.x * d0, y: origin.y + along.y * t0 + inward.y * d0 },
    { x: origin.x + along.x * t1 + inward.x * d0, y: origin.y + along.y * t1 + inward.y * d0 },
    { x: origin.x + along.x * t1 + inward.x * d1, y: origin.y + along.y * t1 + inward.y * d1 },
    { x: origin.x + along.x * t0 + inward.x * d1, y: origin.y + along.y * t0 + inward.y * d1 },
  ];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
}

function toiletAlongRange(wallLen, tankAlong) {
  const extra = Math.max(0, (TOILET_CLEAR_ALONG_M - tankAlong) / 2);
  const minAlong = extra;
  const maxAlong = Math.max(minAlong, wallLen - tankAlong - extra);
  return { minAlong, maxAlong };
}

function defaultToiletPlacement(room) {
  const side = room.h >= room.w ? "bottom" : "right";
  const wallLen = side === "left" || side === "right" ? room.h : room.w;
  const tankAlong = Math.min(TOILET_TANK_ALONG_M, Math.max(0.2, wallLen - 0.05));
  const { minAlong, maxAlong } = toiletAlongRange(wallLen, tankAlong);
  return {
    side,
    along: Math.max(minAlong, Math.min(maxAlong, wallLen - tankAlong - 0.04)),
  };
}

function bathroomToilet(room) {
  if (!room || !isBathLike(room)) return null;
  const def = defaultToiletPlacement(room);
  const stored = room?.toiletSide;
  const toiletSide =
    stored === "top" || stored === "right" || stored === "bottom" || stored === "left"
      ? stored
      : def.side;
  const frame = roomWallFrame(room, toiletSide);
  const tankAlong = Math.min(TOILET_TANK_ALONG_M, Math.max(0.2, frame.wallLen - 0.05));
  const roomDepth = toiletSide === "left" || toiletSide === "right" ? room.w : room.h;
  const tankDepth = Math.min(TOILET_TANK_DEPTH_M, Math.max(0.1, roomDepth * 0.35));
  const bowlWidth = Math.min(TOILET_BOWL_WIDTH_M, tankAlong);
  const bowlLength = Math.min(TOILET_BOWL_LENGTH_M, Math.max(0.25, roomDepth - tankDepth - 0.05));
  const { minAlong, maxAlong } = toiletAlongRange(frame.wallLen, tankAlong);
  const storedAlong = Number(room?.toiletAlong);
  const alongM = Number.isFinite(storedAlong)
    ? Math.max(minAlong, Math.min(maxAlong, storedAlong))
    : Math.max(minAlong, Math.min(maxAlong, def.along));
  const origin = frame.origin;
  const along = frame.along;
  const inward = frame.inward;
  const tank = wallBoxRect(origin, along, inward, alongM, alongM + tankAlong, 0, tankDepth);
  const mid = alongM + tankAlong / 2;
  const overlap = Math.min(0.05, tankDepth * 0.3);
  const bowlFront = tankDepth - overlap + bowlLength;
  const bowl = wallBoxRect(
    origin,
    along,
    inward,
    mid - bowlWidth / 2,
    mid + bowlWidth / 2,
    tankDepth - overlap,
    bowlFront
  );
  const clearAlong = TOILET_CLEAR_ALONG_M;
  const clearDepth = Math.min(TOILET_CLEAR_DEPTH_M, Math.max(0, roomDepth - bowlFront));
  const clear = wallBoxRect(
    origin,
    along,
    inward,
    mid - clearAlong / 2,
    mid + clearAlong / 2,
    bowlFront,
    bowlFront + clearDepth
  );
  const rect = unionRect(tank, bowl);
  return {
    toiletSide,
    along,
    inward,
    alongM,
    tankAlong,
    tank,
    bowl,
    clear,
    rect,
    grab: rectCenter(rect),
    anchor: {
      x: origin.x + along.x * alongM,
      y: origin.y + along.y * alongM,
    },
  };
}

/** Door swing + 600mm robe for a bedroom, in world metres. */
function bedroomDoorAndRobe(room, innerMetres) {
  if (!room || roomKind(room) !== "bedroom") return null;
  const door = roomDoorSwing(room, innerMetres);
  if (!door) return null;
  const robeDef = defaultRobePlacement(room, door.doorSide);
  const storedRobeSide = room?.robeSide;
  const robeSide =
    storedRobeSide === "top" ||
    storedRobeSide === "right" ||
    storedRobeSide === "bottom" ||
    storedRobeSide === "left"
      ? storedRobeSide
      : robeDef.side;
  const robeFrame = roomWallFrame(room, robeSide);
  const robeAlongDir = robeFrame.along;
  const robeInward = robeFrame.inward;
  const robeWallLen = robeFrame.wallLen;
  const robeWidth = Math.min(
    Math.max(0.2, robeWallLen),
    roomRobeWidthM(room)
  );
  const robeMaxAlong = Math.max(0, robeWallLen - robeWidth);
  const storedRobeAlong = Number(room?.robeAlong);
  const robeAlongM = Number.isFinite(storedRobeAlong)
    ? Math.max(0, Math.min(robeMaxAlong, storedRobeAlong))
    : robeSide === robeDef.side
      ? Math.max(0, Math.min(robeMaxAlong, robeDef.along))
      : 0;
  const robeAnchor = {
    x: robeFrame.origin.x + robeAlongDir.x * robeAlongM,
    y: robeFrame.origin.y + robeAlongDir.y * robeAlongM,
  };
  const robeEnd = {
    x: robeAnchor.x + robeAlongDir.x * robeWidth,
    y: robeAnchor.y + robeAlongDir.y * robeWidth,
  };
  const robeInnerA = {
    x: robeAnchor.x + robeInward.x * ROBE_DEPTH_M,
    y: robeAnchor.y + robeInward.y * ROBE_DEPTH_M,
  };
  const robeInnerB = {
    x: robeEnd.x + robeInward.x * ROBE_DEPTH_M,
    y: robeEnd.y + robeInward.y * ROBE_DEPTH_M,
  };
  const robeXs = [robeAnchor.x, robeEnd.x, robeInnerA.x, robeInnerB.x];
  const robeYs = [robeAnchor.y, robeEnd.y, robeInnerA.y, robeInnerB.y];
  const robeRect = {
    x: Math.min(...robeXs),
    y: Math.min(...robeYs),
    w: Math.max(...robeXs) - Math.min(...robeXs),
    h: Math.max(...robeYs) - Math.min(...robeYs),
  };
  return {
    ...door,
    robeSide,
    robeWidth,
    robeRect,
    robeAnchor,
    robeEnd,
    robeInnerA,
    robeInnerB,
    robeAlong: robeAlongDir,
    robeInward,
    robeAlongM,
    robeWallLen,
    robeGrab: rectCenter(robeRect),
    ...robeTextSpots(robeRect, robeSide === "left" || robeSide === "right", robeInward),
  };
}

/**
 * "ROBE" sits above the grab square (on side walls the text reads bottom-to-top, so "above" is
 * screen left); the width sits just outside the robe front, turned the same way as "ROBE".
 */
function robeTextSpots(robeRect, vertical, inward) {
  const c = rectCenter(robeRect);
  const gap = 0.14;
  const down = vertical ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const out = ROBE_DEPTH_M / 2 + 0.12;
  return {
    robeTitle: { x: c.x - down.x * gap, y: c.y - down.y * gap, vertical },
    robeLabel: { x: c.x + inward.x * out, y: c.y + inward.y * out, vertical },
  };
}

function cutBedroomDoorsFromWalls(walls, rooms, innerMetres) {
  let segs = (walls || []).slice();
  for (const room of rooms || []) {
    const geom = roomDoorSwing(room, innerMetres);
    if (!geom?.cut) continue;
    if (roomDoorSideIsExternal(room, geom.doorSide, innerMetres)) continue;
    if (!roomPartitionSides(room, innerMetres)[geom.doorSide]) continue;
    const next = [];
    for (const s of segs) {
      if (s.axis !== geom.cut.axis) {
        next.push(s);
        continue;
      }
      const same =
        s.axis === "h"
          ? almostEqualM(s.y, geom.cut.pos)
          : almostEqualM(s.x, geom.cut.pos);
      if (!same) {
        next.push(s);
        continue;
      }
      const lo = Math.min(geom.cut.t0, geom.cut.t1);
      const hi = Math.max(geom.cut.t0, geom.cut.t1);
      for (const [t0, t1] of subtractIntervals(s.t0, s.t1, [[lo, hi]])) {
        if (s.axis === "h") next.push({ axis: "h", y: s.y, t0, t1 });
        else next.push({ axis: "v", x: s.x, t0, t1 });
      }
    }
    segs = next;
  }
  return mergePartitionWalls(segs);
}

function mPointToPx(p, layout) {
  return {
    x: p.x * layout.scale + layout.originX,
    y: p.y * layout.scale + layout.originY,
  };
}

function pickClosestGrab(raw, size, candidates) {
  const hitR = size / 2 + 5;
  let best = null;
  for (const c of candidates) {
    if (!c?.px) continue;
    const d = Math.hypot(raw.x - c.px.x, raw.y - c.px.y);
    if (d <= hitR && (!best || d < best.d)) best = { ...c, d };
  }
  return best ? { type: best.type, kind: "move" } : null;
}

function hitLayoutRect(rectM, layout, raw, pad = 4) {
  if (!rectM || !(rectM.w > 0) || !(rectM.h > 0) || !layout) return false;
  const r = mRectToPx(rectM, layout);
  return (
    raw.x >= r.x - pad &&
    raw.x <= r.x + r.w + pad &&
    raw.y >= r.y - pad &&
    raw.y <= r.y + r.h + pad
  );
}

function hitBedroomFixtureHandle(room, layout, raw, innerMetres) {
  const geom = bedroomDoorAndRobe(room, innerMetres);
  const options = hitDoorOptionsHandle(geom, layout, raw);
  if (options) return options;
  const flip = hitDoorFlipHandle(geom, layout, raw);
  if (flip) return flip;
  const resize = hitBedroomRobeResizeHandle(geom, layout, raw);
  if (resize) return resize;
  const { bed, nightstands, group } = bedLayout(room, innerMetres);
  if (geom?.robeRect && hitLayoutRect(geom.robeRect, layout, raw, 2)) {
    return { type: "robe", kind: "move" };
  }
  if (hitLayoutRect(bed, layout, raw, 4)) return { type: "bed", kind: "move" };
  if ((nightstands || []).some((ns) => hitLayoutRect(ns, layout, raw, 2))) {
    return { type: "bed", kind: "move" };
  }
  const hs = fixtureGrabPx(layout);
  const grabTarget = group || bed;
  return pickClosestGrab(raw, hs, [
    geom ? { type: "door", px: mPointToPx(geom.doorGrab, layout) } : null,
    geom ? { type: "robe", px: mPointToPx(geom.robeGrab, layout) } : null,
    { type: "bed", px: mPointToPx(rectCenter(grabTarget), layout) },
  ]);
}

function wmLabelPx(wmPx) {
  return Math.max(9, Math.min(wmPx.w, wmPx.h) * 0.22);
}

function rectsOverlapM(a, b, eps = 0.001) {
  if (!a || !b) return false;
  return a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps;
}

function doorSwingBox(door) {
  if (!door) return null;
  const pts = [door.hinge, door.closed, door.open].filter(Boolean);
  if (pts.length < 2) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** True when the washing machine space (with its 75 mm gaps) leaves the room or hits another fixture. */
function vanityWmConflicts(room, innerMetres) {
  const zone = bathroomVanity(room, innerMetres)?.wm?.zone;
  if (!zone) return false;
  const eps = 0.001;
  if (
    zone.x < room.x - eps ||
    zone.y < room.y - eps ||
    zone.x + zone.w > room.x + room.w + eps ||
    zone.y + zone.h > room.y + room.h + eps
  ) {
    return true;
  }
  const { shower, toilet, clear, tank, bowl } = bathroomFixtures(room);
  const door = doorSwingBox(roomDoorSwing(room, innerMetres));
  return [shower, toilet, clear, tank, bowl, door].some((r) => rectsOverlapM(zone, r));
}

/** Nearest vanity position on its current wall where the washing machine space fits, or null. */
function placeVanityWm(room, innerMetres, preferAlong = null) {
  const v = bathroomVanity(room, innerMetres);
  if (!v?.wm) return room;
  const frame = roomWallFrame(room, v.vanitySide);
  const { min, max, butt } = vanityAlongRange(room, frame, v.length, innerMetres);
  const target =
    preferAlong === "butt" && butt !== null
      ? butt
      : Number.isFinite(preferAlong)
        ? preferAlong
        : v.alongM;
  const candidates = [min, max];
  for (let t = Math.ceil(min / BUILDING_STEP_M) * BUILDING_STEP_M; t < max; t += BUILDING_STEP_M) {
    candidates.push(roundMm(t));
  }
  candidates.sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
  for (const along of candidates) {
    const next = { ...room, vanitySide: v.vanitySide, vanityAlong: along };
    if (!vanityWmConflicts(next, innerMetres)) return next;
  }
  return null;
}

/** Options icon sits just in front of the vanity, centred on it. */
function vanityOptionsHandlePx(vanity, layout) {
  if (!vanity) return null;
  const size = fixtureGrabPx(layout);
  const front = mPointToPx(
    { x: (vanity.innerA.x + vanity.innerB.x) / 2, y: (vanity.innerA.y + vanity.innerB.y) / 2 },
    layout
  );
  const off = size / 2 + 4;
  return { cx: front.x + vanity.inward.x * off, cy: front.y + vanity.inward.y * off, size };
}

function hitBathroomFixtureHandle(room, layout, raw, innerMetres) {
  const door = roomDoorSwing(room, innerMetres);
  const vanity = bathroomVanity(room, innerMetres);
  const { shower, tank, bowl, toilet, toiletGeom } = bathroomFixtures(room);
  const resize = shower ? hitShowerResizeHandle(shower, room, layout, raw) : null;
  if (resize) return resize;
  const rotate = shower ? hitShowerRotateHandle(shower, layout, raw) : null;
  if (rotate) return rotate;
  const doorOptions = hitDoorOptionsHandle(door, layout, raw);
  if (doorOptions) return doorOptions;
  const flip = hitDoorFlipHandle(door, layout, raw);
  if (flip) return flip;
  const options = vanityOptionsHandlePx(vanity, layout);
  if (options && Math.hypot(raw.x - options.cx, raw.y - options.cy) <= options.size / 2 + 3) {
    return { type: "vanity-options", kind: "rotate" };
  }
  const hs = fixtureGrabPx(layout);
  const grab = pickClosestGrab(raw, hs, [
    door ? { type: "door", px: mPointToPx(door.doorGrab, layout) } : null,
    vanity ? { type: "vanity", px: mPointToPx(vanity.grab, layout) } : null,
    shower ? { type: "shower", px: mPointToPx(rectCenter(shower), layout) } : null,
    toilet ? { type: "toilet", px: mPointToPx(rectCenter(toilet), layout) } : null,
  ]);
  if (grab) return grab;
  if (
    hitLayoutRect(tank, layout, raw, 6) ||
    hitLayoutRect(bowl, layout, raw, 6) ||
    hitLayoutRect(toilet, layout, raw, 6) ||
    hitLayoutRect(toiletGeom?.clear, layout, raw, 4)
  ) {
    return { type: "toilet", kind: "move" };
  }
  if (vanity && hitLayoutRect(vanity.rect, layout, raw, 4)) {
    return { type: "vanity", kind: "move" };
  }
  if (shower && hitLayoutRect(shower, layout, raw, 0)) {
    return { type: "shower", kind: "move" };
  }
  return null;
}

function hasBedroomSide(side) {
  return side === "top" || side === "right" || side === "bottom" || side === "left";
}

/** Save the current robe and bed so dragging another fixture cannot recompute them. */
function pinBedroomFixtures(room, innerMetres) {
  if (!room || roomKind(room) !== "bedroom") return room;
  let next = room;
  if (!hasBedroomSide(room.robeSide) || !Number.isFinite(Number(room.robeAlong))) {
    const geom = bedroomDoorAndRobe(room, innerMetres);
    if (geom) next = { ...next, robeSide: geom.robeSide, robeAlong: snapPlanMm(geom.robeAlongM) };
  }
  if (!hasBedroomSide(room.bedSide) || !Number.isFinite(Number(room.bedAlong))) {
    const bed = bedroomBed(room);
    next = { ...next, bedSide: bed.bedSide, bedAlong: snapPlanMm(bed.alongM) };
  }
  return next;
}

function moveBedroomDoor(room, cursorM, grabAlong, innerMetres) {
  const pinned = pinBedroomFixtures(room, innerMetres);
  const hit = nearestRoomSide(pinned, cursorM);
  if (!hit) return room;
  const current = pinned?.doorSide;
  let use = hit;
  if (current === "top" || current === "right" || current === "bottom" || current === "left") {
    const x0 = room.x;
    const y0 = room.y;
    const x1 = room.x + room.w;
    const y1 = room.y + room.h;
    const cur =
      current === "top"
        ? { side: "top", d: Math.abs(cursorM.y - y0), t: cursorM.x - x0, wallLen: room.w }
        : current === "bottom"
          ? { side: "bottom", d: Math.abs(cursorM.y - y1), t: cursorM.x - x0, wallLen: room.w }
          : current === "left"
            ? { side: "left", d: Math.abs(cursorM.x - x0), t: cursorM.y - y0, wallLen: room.h }
            : { side: "right", d: Math.abs(cursorM.x - x1), t: cursorM.y - y0, wallLen: room.h };
    if (cur.d <= hit.d + 0.18) use = cur;
  }
  const doorWidth = Math.min(roomDoorWidthM(pinned), Math.max(0.2, use.wallLen - 0.05));
  const offset = Number.isFinite(grabAlong) ? grabAlong : doorWidth / 2;
  const doorAlong = snapPlanMm(
    Math.max(0, Math.min(Math.max(0, use.wallLen - doorWidth), use.t - offset))
  );
  return {
    ...pinned,
    doorSide: use.side,
    doorAlong,
  };
}

function movePorchFrontDoor(room, cursorM, grabAlong, metres) {
  const door = porchFrontDoor(room, metres);
  if (!door) return room;
  const frame = roomWallFrame(porchHostRect(room, metres), door.doorSide);
  const t =
    (cursorM.x - frame.origin.x) * frame.along.x +
    (cursorM.y - frame.origin.y) * frame.along.y;
  const doorWidth = Math.min(DOOR_WIDTH_DEFAULT_M, Math.max(0.2, frame.wallLen - 0.05));
  const offset = Number.isFinite(grabAlong) ? grabAlong : doorWidth / 2;
  return {
    ...room,
    doorAlong: snapPlanMm(
      Math.max(0, Math.min(Math.max(0, frame.wallLen - doorWidth), t - offset))
    ),
  };
}

function hitPorchFixtureHandle(room, layout, raw, metres) {
  const opt = porchStepOptionsPx(room, layout, metres);
  if (opt && Math.hypot(raw.x - opt.cx, raw.y - opt.cy) <= opt.size / 2 + 4) {
    return { type: "porch-options", kind: "rotate" };
  }
  const resize = hitPorchResizeHandle(room, layout, raw, metres);
  if (resize) return resize;
  const door = porchFrontDoor(room, metres);
  if (!door) return null;
  const flip = hitDoorFlipHandle(door, layout, raw);
  if (flip) return flip;
  return pickClosestGrab(raw, fixtureGrabPx(layout), [
    { type: "door", px: mPointToPx(door.doorGrab, layout) },
  ]);
}

function hitBedroomRobeResizeHandle(geom, layout, raw) {
  if (!geom) return null;
  const hs = fixtureGrabPx(layout);
  const hitR = hs / 2 + 5;
  let best = null;
  for (const h of robeResizeHandles(geom)) {
    const px = mPointToPx(h.point, layout);
    const d = Math.hypot(raw.x - px.x, raw.y - px.y);
    if (d <= hitR && (!best || d < best.d)) best = { which: h.which, d };
  }
  if (!best) return null;
  return {
    type: "robe-resize",
    kind: robeResizeAxis(geom),
    which: best.which,
  };
}

function robeAlongFromCursor(room, geom, cursorM) {
  const frame = roomWallFrame(room, geom.robeSide);
  return (cursorM.x - frame.origin.x) * frame.along.x + (cursorM.y - frame.origin.y) * frame.along.y;
}

function robeHandleAlong(geom, which) {
  const t = ROBE_NIB_T_M;
  if (which === "start") return geom.robeAlongM - t / 2;
  return geom.robeAlongM + geom.robeWidth + t / 2;
}

function startRobeResizeDrag(room, which, cursorM, innerMetres) {
  const geom = bedroomDoorAndRobe(room, innerMetres);
  if (!geom) return { mode: "robe-resize", which };
  return {
    mode: "robe-resize",
    which,
    grabAlong: robeAlongFromCursor(room, geom, cursorM) - robeHandleAlong(geom, which),
  };
}

function moveBedroomRobeSize(room, which, cursorM, grabAlong, innerMetres) {
  const geom = bedroomDoorAndRobe(room, innerMetres);
  if (!geom) return room;
  const frame = roomWallFrame(room, geom.robeSide);
  const handleT = snapPlanMm(
    robeAlongFromCursor(room, geom, cursorM) - (Number.isFinite(grabAlong) ? grabAlong : 0)
  );
  const start = geom.robeAlongM;
  const end = start + geom.robeWidth;
  const minW = ROBE_MIN_M;
  const maxW = Math.min(ROBE_MAX_M, snapPlanMm(frame.wallLen));
  let nextStart = start;
  let nextEnd = end;
  if (which === "start") {
    const edge = snapPlanMm(handleT + ROBE_NIB_T_M / 2);
    nextStart = Math.max(snapPlanMm(Math.max(0, end - maxW)), Math.min(snapPlanMm(end - minW), edge));
    nextEnd = end;
  } else {
    const edge = snapPlanMm(handleT - ROBE_NIB_T_M / 2);
    nextEnd = Math.min(
      snapPlanMm(Math.min(frame.wallLen, start + maxW)),
      Math.max(snapPlanMm(start + minW), edge)
    );
    nextStart = start;
  }
  return {
    ...room,
    robeSide: geom.robeSide,
    robeAlong: snapPlanMm(nextStart),
    robeWidth: snapPlanMm(Math.max(minW, Math.min(maxW, nextEnd - nextStart))),
  };
}

function moveBedroomRobe(room, cursorM, grabAlong, innerMetres) {
  const pinned = pinBedroomFixtures(room, innerMetres);
  const hit = nearestRoomSide(pinned, cursorM);
  if (!hit) return pinned;
  const robeWidth = Math.min(Math.max(0.2, hit.wallLen), roomRobeWidthM(pinned));
  const offset = Number.isFinite(grabAlong) ? grabAlong : robeWidth / 2;
  return {
    ...pinned,
    robeSide: hit.side,
    robeAlong: snapPlanMm(
      Math.max(0, Math.min(Math.max(0, hit.wallLen - robeWidth), hit.t - offset))
    ),
  };
}

function moveLaundryBench(room, cursorM, innerMetres) {
  const hit = nearestRoomSide(room, cursorM);
  if (!hit) return room;
  const bench = laundryBench({ ...room, benchSide: hit.side }, innerMetres);
  if (!bench) return { ...room, benchSide: hit.side };
  return { ...room, benchSide: hit.side, wmAlong: bench.wm.along, sinkAlong: bench.sink.along };
}

function moveLaundryWm(room, cursorM, innerMetres) {
  const bench = laundryBench(room, innerMetres);
  if (!bench) return room;
  const t =
    (cursorM.x - bench.origin.x) * bench.along.x + (cursorM.y - bench.origin.y) * bench.along.y;
  const wmAlong = clampLaundryWm(t - WM_SIZE_M / 2, bench.length);
  return {
    ...room,
    benchSide: bench.benchSide,
    wmAlong,
    sinkAlong: clampLaundrySink(bench.sink.along, bench.length, wmAlong),
  };
}

function moveLaundrySink(room, cursorM, innerMetres) {
  const bench = laundryBench(room, innerMetres);
  if (!bench) return room;
  const t =
    (cursorM.x - bench.origin.x) * bench.along.x + (cursorM.y - bench.origin.y) * bench.along.y;
  return {
    ...room,
    benchSide: bench.benchSide,
    wmAlong: bench.wm.along,
    sinkAlong: clampLaundrySink(t - LAUNDRY_SINK_M / 2, bench.length, bench.wm.along),
  };
}

function hitLaundryFixtureHandle(room, layout, raw, innerMetres) {
  const door = roomDoorSwing(room, innerMetres);
  const bench = laundryBench(room, innerMetres);
  const doorOptions = hitDoorOptionsHandle(door, layout, raw);
  if (doorOptions) return doorOptions;
  const flip = door?.sliding ? null : hitDoorFlipHandle(door, layout, raw);
  if (flip) return flip;
  const hs = fixtureGrabPx(layout);
  const doorGrab = pickClosestGrab(raw, hs, [
    door ? { type: "door", px: mPointToPx(door.doorGrab, layout) } : null,
  ]);
  if (doorGrab) return doorGrab;
  if (bench?.wm && hitLayoutRect(bench.wm.rect, layout, raw, 4)) return { type: "laundry-wm", kind: "move" };
  if (bench?.sink && hitLayoutRect(bench.sink.rect, layout, raw, 4)) {
    return { type: "laundry-sink", kind: "move" };
  }
  if (bench && hitLayoutRect(bench.rect, layout, raw, 4)) return { type: "laundry-bench", kind: "move" };
  return null;
}

function moveBathroomVanity(room, cursorM, grabAlong, innerMetres) {
  const hit = nearestRoomSide(room, cursorM);
  if (!hit) return room;
  const length = Math.min(vanityLengthM(room), Math.max(0.2, hit.wallLen - 0.05));
  const offset = Number.isFinite(grabAlong) ? grabAlong : length / 2;
  const { min, max, butt } = vanityAlongRange(room, roomWallFrame(room, hit.side), length, innerMetres);
  const want = Math.max(min, Math.min(max, hit.t - offset));
  const next = {
    ...room,
    vanitySide: hit.side,
    vanityAlong:
      butt !== null && Math.abs(want - butt) <= VANITY_WM_BUTT_SNAP_M ? butt : snapPlanMm(want),
  };
  if (!vanityWmSide(next) || !vanityWmConflicts(next, innerMetres)) return next;
  return placeVanityWm(next, innerMetres, next.vanityAlong) || room;
}

function moveBathroomToilet(room, cursorM, grabAlong) {
  const hit = nearestRoomSide(room, cursorM);
  if (!hit) return room;
  const tankAlong = Math.min(TOILET_TANK_ALONG_M, Math.max(0.2, hit.wallLen - 0.05));
  const { minAlong, maxAlong } = toiletAlongRange(hit.wallLen, tankAlong);
  const offset = Number.isFinite(grabAlong) ? grabAlong : tankAlong / 2;
  return {
    ...room,
    toiletSide: hit.side,
    toiletAlong: snapPlanMm(Math.max(minAlong, Math.min(maxAlong, hit.t - offset))),
  };
}

function moveBedroomBed(room, cursorM, grabAlong, innerMetres) {
  const pinned = pinBedroomFixtures(room, innerMetres);
  const hit = nearestRoomSide(pinned, cursorM);
  if (!hit) return pinned;
  const alongLen = BED_SHORT_M;
  const offset = Number.isFinite(grabAlong) ? grabAlong : alongLen / 2;
  return {
    ...pinned,
    bedSide: hit.side,
    bedAlong: snapPlanMm(clampBedAlong(hit.wallLen, hit.t - offset)),
  };
}

function moveRoomItemRect(room, startRect, cursorM, grab, keyX, keyY) {
  const next = clampRectInRoom(room, {
    x: cursorM.x - (grab?.dx || 0),
    y: cursorM.y - (grab?.dy || 0),
    w: startRect.w,
    h: startRect.h,
  });
  return {
    ...room,
    [keyX]: snapPlanMm(next.x - room.x),
    [keyY]: snapPlanMm(next.y - room.y),
  };
}

function startFixtureDrag(type, room, cursorM, innerMetres, metres) {
  if (type === "door") {
    const geom = isPorch(room)
      ? porchFrontDoor(room, metres)
      : roomDoorSwing(room, innerMetres);
    const start = geom.openingStart || geom.hinge;
    return {
      mode: type,
      grabAlong:
        (cursorM.x - start.x) * geom.along.x +
        (cursorM.y - start.y) * geom.along.y,
    };
  }
  if (type === "robe") {
    const geom = bedroomDoorAndRobe(room, innerMetres);
    return {
      mode: type,
      grabAlong:
        (cursorM.x - geom.robeAnchor.x) * geom.robeAlong.x +
        (cursorM.y - geom.robeAnchor.y) * geom.robeAlong.y,
    };
  }
  if (type === "laundry-bench" || type === "laundry-wm" || type === "laundry-sink") {
    return { mode: type };
  }
  if (type === "vanity") {
    const vanity = bathroomVanity(room, innerMetres);
    return {
      mode: type,
      grabAlong:
        (cursorM.x - vanity.anchor.x) * vanity.along.x +
        (cursorM.y - vanity.anchor.y) * vanity.along.y,
    };
  }
  if (type === "toilet") {
    const geom = bathroomToilet(room);
    return {
      mode: type,
      grabAlong:
        (cursorM.x - geom.anchor.x) * geom.along.x +
        (cursorM.y - geom.anchor.y) * geom.along.y,
    };
  }
  if (type === "bed") {
    const geom = bedroomBed(room, innerMetres);
    return {
      mode: type,
      grabAlong:
        (cursorM.x - geom.anchor.x) * geom.along.x +
        (cursorM.y - geom.anchor.y) * geom.along.y,
    };
  }
  const rect = bathroomFixtures(room).shower;
  if (!rect) return { mode: type, grab: { dx: 0, dy: 0 } };
  return {
    mode: type,
    grab: { dx: cursorM.x - rect.x, dy: cursorM.y - rect.y },
  };
}

/** Bedroom/bathroom edges that are not already on the external wall. Kitchen/porch add none. */
function bedroomBathroomInternalWalls(rooms, innerMetres) {
  return cutBedroomDoorsFromWalls(partitionWallsUncut(rooms, innerMetres), rooms, innerMetres);
}

function wallSegMetres(seg) {
  if (seg.axis === "h") {
    return [
      { x: seg.t0, y: seg.y },
      { x: seg.t1, y: seg.y },
    ];
  }
  return [
    { x: seg.x, y: seg.t0 },
    { x: seg.x, y: seg.t1 },
  ];
}

function wallSegToLayoutPx(seg, layout) {
  const [a, b] = wallSegMetres(seg);
  return {
    x1: a.x * layout.scale + layout.originX,
    y1: a.y * layout.scale + layout.originY,
    x2: b.x * layout.scale + layout.originX,
    y2: b.y * layout.scale + layout.originY,
  };
}

/** Outer corner squares where a horizontal and vertical partition meet (butt caps leave a hole). */
function partitionWallCorners(walls, eps = 0.03) {
  const hs = [];
  const vs = [];
  for (const w of walls || []) {
    if (w.axis === "h") hs.push(w);
    else vs.push(w);
  }
  const out = [];
  const seen = new Set();
  for (const h of hs) {
    const y = h.y;
    const lo = Math.min(h.t0, h.t1) - eps;
    const hi = Math.max(h.t0, h.t1) + eps;
    for (const v of vs) {
      const x = v.x;
      if (x < lo || x > hi) continue;
      const vlo = Math.min(v.t0, v.t1) - eps;
      const vhi = Math.max(v.t0, v.t1) + eps;
      if (y < vlo || y > vhi) continue;
      const key = `${x.toFixed(3)}:${y.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ x, y });
    }
  }
  return out;
}

function wallCornerToLayoutPx(c, layout) {
  return {
    x: c.x * layout.scale + layout.originX,
    y: c.y * layout.scale + layout.originY,
  };
}

function polygonPathD(pts) {
  if (!pts?.length) return "";
  const parts = [`M ${pts[0].x} ${pts[0].y}`];
  for (let i = 1; i < pts.length; i += 1) {
    parts.push(`L ${pts[i].x} ${pts[i].y}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

function pointInPolygon(p, pts) {
  if (!pts || pts.length < 3) return false;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const a = pts[i];
    const b = pts[j];
    const hit =
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-12) + a.x;
    if (hit) inside = !inside;
  }
  return inside;
}

function pointInRoom(p, room) {
  return (
    p.x >= room.x &&
    p.x <= room.x + room.w &&
    p.y >= room.y &&
    p.y <= room.y + room.h
  );
}

function pointOnSegment(p, a, b, eps = 1e-6) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const len = Math.hypot(abx, aby);
  if (len < 1e-12) return Math.hypot(apx, apy) <= eps;
  const cross = apx * aby - apy * abx;
  if (Math.abs(cross) > eps * len) return false;
  const dot = apx * abx + apy * aby;
  return dot >= -eps * len && dot <= len * len + eps * len;
}

function pointInOrOnPolygon(p, pts) {
  if (pointInPolygon(p, pts)) return true;
  const n = pts.length;
  for (let i = 0; i < n; i += 1) {
    if (pointOnSegment(p, pts[i], pts[(i + 1) % n])) return true;
  }
  return false;
}

function rectInsidePolygon(room, poly) {
  if (!poly?.length || !(room.w > 0) || !(room.h > 0)) return false;
  const pad = 1e-4;
  if (room.w <= pad * 2 || room.h <= pad * 2) {
    return pointInOrOnPolygon(
      { x: room.x + room.w / 2, y: room.y + room.h / 2 },
      poly
    );
  }
  const x = room.x + pad;
  const y = room.y + pad;
  const w = room.w - 2 * pad;
  const h = room.h - 2 * pad;
  const pts = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
    { x: x + w / 2, y },
    { x: x + w / 2, y: y + h },
    { x, y: y + h / 2 },
    { x: x + w, y: y + h / 2 },
  ];
  return pts.every((p) => pointInOrOnPolygon(p, poly));
}

function livingSetTvSide(room) {
  const rot = roomRotation(room);
  return rot === 90 ? "right" : rot === 180 ? "bottom" : rot === 270 ? "left" : "top";
}

/**
 * Furniture rects (world metres) for a living set. The TV unit sits against the TV edge,
 * the couch back against the opposite edge, the coffee table midway; all centred along.
 * Pieces keep their size — resizing the group only changes the spacing.
 */
const COUCH_TYPES = ["2", "3", "L-right", "L-left"];

function livingCouchType(room) {
  return COUCH_TYPES.includes(room?.couchType) ? room.couchType : "3";
}

function couchIsL(type) {
  return type === "L-right" || type === "L-left";
}

function couchWidthM(type) {
  if (type === "2") return COUCH_ARM_M * 2 + COUCH_CUSHION_M * 2;
  if (couchIsL(type)) return COUCH_ARM_M + COUCH_CUSHION_M * 3 + COUCH_BACK_M;
  return COUCH_W_M;
}

/** How far the couch reaches in from its back edge (the L return pokes further forward). */
function couchReachM(type) {
  return couchIsL(type) ? COUCH_D_M + COUCH_CUSHION_M + COUCH_ARM_M : COUCH_D_M;
}

/**
 * Furniture rects (world metres) for a living set. The TV unit sits against the TV edge,
 * the couch back against the opposite edge, the coffee table midway; all centred along.
 * Pieces keep their size — resizing the group only changes the spacing.
 * L couches put the extra seat on the sitter's left/right (facing the TV).
 */
function livingSetGeom(room) {
  const tvSide = livingSetTvSide(room);
  const frame = roomWallFrame(room, tvSide);
  const depth = tvSide === "left" || tvSide === "right" ? room.w : room.h;
  const c = frame.wallLen / 2;
  const box = (t0, t1, d0, d1) => wallBoxRect(frame.origin, frame.along, frame.inward, t0, t1, d0, d1);
  const type = livingCouchType(room);
  const A = COUCH_ARM_M;
  const C = COUCH_CUSHION_M;
  const W = couchWidthM(type);
  const s0 = c - W / 2;
  const s1 = c + W / 2;
  const seatD0 = depth - COUCH_D_M;
  const seatD1 = depth - COUCH_BACK_M;
  const alongIsRight = frame.along.x * frame.inward.y - frame.along.y * frame.inward.x > 0;
  // u runs from the plain (armed) end of the couch towards the L end.
  const lAtEnd = type === "L-right" ? alongIsRight : !alongIsRight;
  const tOf = (u) => (lAtEnd ? s0 + u : s1 - u);
  const ubox = (u0, u1, d0, d1) => box(tOf(u0), tOf(u1), d0, d1);

  let bodies;
  let backs;
  let arms;
  let cushions;
  let tableU;
  let optionsU;
  if (couchIsL(type)) {
    const retD0 = depth - couchReachM(type);
    const cornerU = A + C * 2;
    bodies = [ubox(0, W, seatD0, depth), ubox(cornerU, W, retD0, seatD0)];
    backs = [ubox(0, W, seatD1, depth), ubox(W - COUCH_BACK_M, W, retD0, seatD1)];
    arms = [ubox(0, A, seatD0, depth), ubox(cornerU, cornerU + C, retD0, retD0 + A)];
    cushions = [
      ...[0, 1, 2].map((i) => ubox(A + i * C, A + (i + 1) * C, seatD0, seatD1)),
      ubox(cornerU, cornerU + C, retD0 + A, seatD0),
    ];
    tableU = cornerU / 2;
    optionsU = A + C * 1.5;
  } else {
    const n = type === "2" ? 2 : 3;
    bodies = [ubox(0, W, seatD0, depth)];
    backs = [ubox(0, W, seatD1, depth)];
    arms = [ubox(0, A, seatD0, depth), ubox(W - A, W, seatD0, depth)];
    cushions = Array.from({ length: n }, (_, i) => ubox(A + i * C, A + (i + 1) * C, seatD0, seatD1));
    tableU = W / 2;
    optionsU = W / 2;
  }
  const tableMid = (TV_UNIT_D_M + seatD0) / 2;
  const tableT = tOf(tableU);
  const optionsT = tOf(optionsU);
  const optionsD = (seatD0 + seatD1) / 2;
  return {
    tvUnit: box(c - TV_UNIT_W_M / 2, c + TV_UNIT_W_M / 2, 0, TV_UNIT_D_M),
    tv: box(c - TV_W_M / 2, c + TV_W_M / 2, 0.1, 0.1 + TV_D_M),
    table: box(
      tableT - COFFEE_W_M / 2,
      tableT + COFFEE_W_M / 2,
      tableMid - COFFEE_D_M / 2,
      tableMid + COFFEE_D_M / 2
    ),
    bodies,
    backs,
    arms,
    cushions,
    options: {
      x: frame.origin.x + frame.along.x * optionsT + frame.inward.x * optionsD,
      y: frame.origin.y + frame.along.y * optionsT + frame.inward.y * optionsD,
    },
  };
}

/** Plan draw order: living sets sit above every room and partition wall. */
function roomsStackOrder(rooms) {
  const list = rooms || [];
  return [...list.filter((r) => !isLivingSet(r)), ...list.filter(isLivingSet)];
}

function couchOptionsHandlePx(room, layout) {
  const p = mPointToPx(livingSetGeom(room).options, layout);
  return { cx: p.x, cy: p.y, size: fixtureGrabPx(layout) };
}

function hitCouchOptions(room, layout, raw) {
  if (!isLivingSet(room)) return false;
  const h = couchOptionsHandlePx(room, layout);
  return Math.hypot(raw.x - h.cx, raw.y - h.cy) <= h.size / 2 + 3;
}

/** Next couch style; grows the group if the new couch needs more room. */
function cycleCouchType(room, innerMetres) {
  const i = COUCH_TYPES.indexOf(livingCouchType(room));
  let next = { ...room, couchType: COUCH_TYPES[(i + 1) % COUCH_TYPES.length] };
  const { minW, minH } = roomMinSize(next);
  const grow = (size, min) => (size >= min - 1e-9 ? size : Math.ceil(min / BUILDING_STEP_M - 1e-9) * BUILDING_STEP_M);
  const w = grow(next.w, minW);
  const h = grow(next.h, minH);
  if (w !== next.w || h !== next.h) {
    next = { ...next, x: roundMm(next.x - (w - next.w) / 2), y: roundMm(next.y - (h - next.h) / 2), w, h };
    next = keepRoomInside(room, next, innerMetres);
  }
  return next;
}

function livingSetPieces(room, bw = false) {
  const g = livingSetGeom(room);
  const wood = bw ? "#ffffff" : PLAN_WOOD;
  const woodEdge = bw ? "#111111" : PLAN_WOOD_EDGE;
  const soft = bw ? "#ffffff" : COUCH_FILL;
  const softDark = bw ? "#ffffff" : "#e4ded3";
  const softEdge = bw ? "#111111" : COUCH_EDGE;
  return [
    { rect: g.tvUnit, fill: wood, stroke: woodEdge },
    { rect: g.tv, fill: bw ? "#111111" : TV_FILL, stroke: bw ? "#111111" : TV_FILL },
    { rect: g.table, fill: wood, stroke: woodEdge },
    ...g.bodies.map((rect) => ({ rect, fill: softDark, stroke: softEdge })),
    ...g.backs.map((rect) => ({ rect, fill: softDark, stroke: softEdge })),
    ...g.arms.map((rect) => ({ rect, fill: softDark, stroke: softEdge })),
    ...g.cushions.map((rect) => ({ rect, fill: soft, stroke: softEdge, round: true })),
  ];
}

function LivingSetFixtures({ room, layout, showHandles = false }) {
  const options = couchOptionsHandlePx(room, layout);
  return (
    <g style={{ pointerEvents: "none" }}>
      {livingSetPieces(room).map((p, i) => {
        const r = mRectToPx(p.rect, layout);
        const rad = p.round ? Math.min(r.w, r.h) * 0.12 : 1;
        return (
          <rect
            key={`lv-${i}`}
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            rx={rad}
            fill={p.fill}
            stroke={p.stroke}
            strokeWidth="1"
          />
        );
      })}
      {showHandles ? (
        <OptionsHandle cx={options.cx} cy={options.cy} size={options.size} color={ROOM_LIVING} />
      ) : null}
    </g>
  );
}

function drawLivingSetCanvas(ctx, room, layout, bw) {
  ctx.save();
  ctx.lineWidth = 1;
  for (const p of livingSetPieces(room, bw)) {
    const r = mRectToPx(p.rect, layout);
    const rad = p.round ? Math.min(r.w, r.h) * 0.12 : 1;
    drawCanvasRoundRect(ctx, r.x, r.y, r.w, r.h, rad);
    if (!bw || p.fill !== "#ffffff") {
      ctx.fillStyle = p.fill;
      ctx.fill();
    }
    ctx.strokeStyle = p.stroke;
    ctx.stroke();
  }
  ctx.restore();
}

function roomMinSize(room) {
  if (isLivingSet(room)) {
    const type = livingCouchType(room);
    const along = Math.max(couchWidthM(type), TV_UNIT_W_M);
    const across = Math.max(
      LIVING_SET_MIN_ACROSS_M,
      couchReachM(type) + TV_UNIT_D_M + LIVING_SET_GAP_M
    );
    const sideways = livingSetTvSide(room) === "left" || livingSetTvSide(room) === "right";
    return sideways ? { minW: across, minH: along } : { minW: along, minH: across };
  }
  if (isLaundry(room)) {
    const len = LAUNDRY_LENGTHS_M[0];
    return laundryLengthIsX(room)
      ? { minW: len, minH: LAUNDRY_DEPTH_M }
      : { minW: LAUNDRY_DEPTH_M, minH: len };
  }
  if (roomKind(room) !== "kitchen") return { minW: ROOM_MIN_M, minH: ROOM_MIN_M };
  const kind = kitchenLayoutKind(room);
  const d = KITCHEN_BENCH_M;
  const lMin = d * 2;
  const aisleMin = d + KITCHEN_CLEAR_M + KITCHEN_BAR_M;
  const longIsX = roomLayoutLongIsX(room);
  let minLocalW = d;
  let minLocalH = d;
  if (kind === "lshape-left" || kind === "lshape-right") {
    minLocalW = lMin;
    minLocalH = lMin;
  } else if (kind === "cshape") {
    const cAcross = d * 2 + KITCHEN_CLEAR_M;
    if (longIsX) {
      minLocalW = cAcross;
      minLocalH = lMin;
    } else {
      minLocalW = lMin;
      minLocalH = cAcross;
    }
  } else if (kitchenHasWrap(kind) || kind === "island") {
    if (longIsX) {
      minLocalW = lMin;
      minLocalH = aisleMin;
    } else {
      minLocalW = aisleMin;
      minLocalH = lMin;
    }
    if (kind === "cbar-left" || kind === "cbar-right") {
      const cAcross = d * 2 + KITCHEN_CLEAR_M;
      if (longIsX) minLocalW = Math.max(minLocalW, cAcross);
      else minLocalH = Math.max(minLocalH, cAcross);
    }
  }
  const rot = roomRotation(room);
  const benches = kitchenWorkBenches(room);
  let packX = 0;
  let packY = 0;
  for (const b of benches) {
    const packed = kitchenPackedLenOnBench(room, b);
    if (b.alongX) packX = Math.max(packX, packed);
    else packY = Math.max(packY, packed);
  }
  minLocalW = Math.max(minLocalW, packX);
  minLocalH = Math.max(minLocalH, packY);
  if (rot === 90 || rot === 270) return { minW: minLocalH, minH: minLocalW };
  return { minW: minLocalW, minH: minLocalH };
}

function clampRoomInInner(room, inner) {
  if (!inner?.length) return room;
  const { minW, minH } = roomMinSize(room);
  const b = buildingBounds(inner);
  const maxW = Math.max(minW, b.maxX - b.minX);
  const maxH = Math.max(minH, b.maxY - b.minY);
  const w = Math.min(Math.max(minW, room.w), maxW);
  const h = Math.min(Math.max(minH, room.h), maxH);
  const x = Math.min(Math.max(room.x, b.minX), b.maxX - w);
  const y = Math.min(Math.max(room.y, b.minY), b.maxY - h);
  return { ...room, x, y, w, h };
}

function keepRoomInside(prev, next, inner) {
  const cand = clampRoomInInner(next, inner);
  if (!inner?.length) return cand;
  if (rectInsidePolygon(cand, inner)) return cand;
  if (prev && rectInsidePolygon(prev, inner)) return prev;
  return cand;
}

function clampRoomEdgeInInner(start, next, side, inner) {
  if (!inner?.length) return next;
  const { minW, minH } = roomMinSize(start);
  const b = buildingBounds(inner);
  const out = { ...next };
  if (side === "left") {
    const right = start.x + start.w;
    out.x = Math.max(out.x, b.minX);
    out.w = Math.max(minW, right - out.x);
  } else if (side === "right") {
    out.w = Math.min(Math.max(minW, out.w), Math.max(minW, b.maxX - out.x));
  } else if (side === "top") {
    const bottom = start.y + start.h;
    out.y = Math.max(out.y, b.minY);
    out.h = Math.max(minH, bottom - out.y);
  } else if (side === "bottom") {
    out.h = Math.min(Math.max(minH, out.h), Math.max(minH, b.maxY - out.y));
  }
  if (rectInsidePolygon(out, inner)) return out;
  return keepRoomInside(start, out, inner);
}

function innerBoundForSide(side, inner) {
  if (!inner?.length) return null;
  const b = buildingBounds(inner);
  if (side === "left") return b.minX;
  if (side === "right") return b.maxX;
  if (side === "top") return b.minY;
  if (side === "bottom") return b.maxY;
  return null;
}

function cursorAtOrPastInnerEdge(side, cursorM, inner, slop = 0) {
  const bound = innerBoundForSide(side, inner);
  if (bound == null || !cursorM) return false;
  if (side === "left") return cursorM.x <= bound + slop;
  if (side === "right") return cursorM.x >= bound - slop;
  if (side === "top") return cursorM.y <= bound + slop;
  return cursorM.y >= bound - slop;
}

function pinRoomEdgeToInner(start, side, inner) {
  const bound = innerBoundForSide(side, inner);
  if (bound == null) return { ...start };
  const { minW, minH } = roomMinSize(start);
  const out = { ...start };
  if (side === "left") {
    out.x = bound;
    out.w = Math.max(minW, start.x + start.w - out.x);
  } else if (side === "right") {
    out.w = Math.max(minW, bound - start.x);
  } else if (side === "top") {
    out.y = bound;
    out.h = Math.max(minH, start.y + start.h - out.y);
  } else {
    out.h = Math.max(minH, bound - start.y);
  }
  return out;
}

function segmentsProperCross(a1, a2, b1, b2) {
  const orient = (a, b, c) => (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x);
  const d1 = orient(a1, a2, b1);
  const d2 = orient(a1, a2, b2);
  const d3 = orient(b1, b2, a1);
  const d4 = orient(b1, b2, a2);
  const eps = 1e-9;
  if (
    Math.abs(d1) < eps ||
    Math.abs(d2) < eps ||
    Math.abs(d3) < eps ||
    Math.abs(d4) < eps
  ) {
    return false;
  }
  return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0);
}

function rectOverlapsPolygonInterior(room, poly) {
  if (!poly?.length || !(room.w > 0) || !(room.h > 0)) return false;
  const pad = 1e-4;
  const x = room.x + pad;
  const y = room.y + pad;
  const w = room.w - 2 * pad;
  const h = room.h - 2 * pad;
  if (!(w > 0) || !(h > 0)) {
    return pointInPolygon({ x: room.x + room.w / 2, y: room.y + room.h / 2 }, poly);
  }
  const corners = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  if (corners.some((p) => pointInPolygon(p, poly))) return true;
  if (pointInPolygon({ x: x + w / 2, y: y + h / 2 }, poly)) return true;
  for (const p of poly) {
    if (p.x > x && p.x < x + w && p.y > y && p.y < y + h) return true;
  }
  const roomEdges = [
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]],
  ];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    for (const [c, d] of roomEdges) {
      if (segmentsProperCross(a, b, c, d)) return true;
    }
  }
  return false;
}

function clampPorchOutside(next, outer) {
  const b = buildingBounds(outer);
  const candidates = [
    { ...next, x: b.minX - next.w },
    { ...next, x: b.maxX },
    { ...next, y: b.minY - next.h },
    { ...next, y: b.maxY },
  ];
  let best = null;
  let bestD = Infinity;
  for (const c of candidates) {
    if (rectOverlapsPolygonInterior(c, outer)) continue;
    const d = Math.hypot(c.x - next.x, c.y - next.y);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function keepPorchOutside(prev, next, outer, { slide: _slide = false } = {}) {
  if (!outer?.length) return next;
  if (porchFootprints(next).every((part) => !rectOverlapsPolygonInterior(part, outer))) return next;
  const clamped = clampPorchOutside(next, outer);
  if (clamped) return clamped;
  if (prev && !rectOverlapsPolygonInterior(prev, outer)) return prev;
  return next;
}

function nextPorchPlacement(rooms, metres, w, h) {
  const b = buildingBounds(metres);
  const n = porchRooms(rooms).length;
  const gap = 0.15;
  const options = [
    { x: b.minX + n * (w + gap), y: b.maxY, w, h },
    { x: b.maxX, y: b.minY + n * (h + gap), w, h },
    { x: b.minX + n * (w + gap), y: b.minY - h, w, h },
    { x: b.minX - w, y: b.minY + n * (h + gap), w, h },
  ];
  for (const placed of options) {
    if (!rectOverlapsPolygonInterior(placed, metres)) return placed;
  }
  return options[0];
}

function porchesStayOutside(porches, metres) {
  return (porches || []).every((r) =>
    porchFootprints(r).every((part) => !rectOverlapsPolygonInterior(part, metres))
  );
}

function clampBuildingEdgeToPorches(base, moved, index, rooms) {
  const porches = porchRooms(rooms);
  if (!porches.length) return moved;
  if (porchesStayOutside(porches, moved)) return moved;
  if (!porchesStayOutside(porches, base)) return base;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    const cand = lerpBuildingEdge(base, moved, index, mid);
    if (porchesStayOutside(porches, cand)) lo = mid;
    else hi = mid;
  }
  return lerpBuildingEdge(base, moved, index, lo);
}

function largestBinaryRect(grid) {
  if (!grid.length || !grid[0].length) return { w: 0, h: 0, area: 0, left: 0, top: 0 };
  const cols = grid[0].length;
  const height = Array(cols).fill(0);
  let best = { w: 0, h: 0, area: 0, left: 0, top: 0 };
  for (let r = 0; r < grid.length; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      height[c] = grid[r][c] ? height[c] + 1 : 0;
    }
    const stack = [];
    for (let c = 0; c <= cols; c += 1) {
      const h = c === cols ? 0 : height[c];
      while (stack.length && height[stack[stack.length - 1]] > h) {
        const hh = height[stack.pop()];
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        const ww = c - left;
        const area = hh * ww;
        if (area > best.area) best = { w: ww, h: hh, area, left, top: r - hh + 1 };
      }
      stack.push(c);
    }
  }
  return best;
}

/** Largest remaining axis-aligned living rectangle, in metres. */
function livingRemainingRect(metres, rooms) {
  if (!metres?.length) return null;
  const b = buildingBounds(metres);
  const spanX = b.maxX - b.minX;
  const spanY = b.maxY - b.minY;
  if (!(spanX > 0.2) || !(spanY > 0.2)) return null;
  const cols = Math.max(8, Math.min(48, Math.round(spanX / 0.15)));
  const rows = Math.max(8, Math.min(48, Math.round(spanY / 0.15)));
  const cellW = spanX / cols;
  const cellH = spanY / rows;
  const grid = [];
  for (let j = 0; j < rows; j += 1) {
    const row = [];
    for (let i = 0; i < cols; i += 1) {
      const p = {
        x: b.minX + (i + 0.5) * cellW,
        y: b.minY + (j + 0.5) * cellH,
      };
      row.push(pointInPolygon(p, metres) && !rooms.some((r) => pointInRoom(p, r)) ? 1 : 0);
    }
    grid.push(row);
  }
  const best = largestBinaryRect(grid);
  if (!(best.area > 0)) return null;
  return {
    x: b.minX + best.left * cellW,
    y: b.minY + best.top * cellH,
    w: best.w * cellW,
    h: best.h * cellH,
  };
}

function livingApproxDims(metres, rooms) {
  const remain = livingRemainingRect(metres, rooms);
  return remain ? { w: remain.w, h: remain.h } : null;
}

function livingLabelPoint(metres, rooms) {
  const remain = livingRemainingRect(metres, rooms);
  if (remain) return { x: remain.x + remain.w / 2, y: remain.y + remain.h / 2 };
  const c = polygonCentroid(metres);
  if (pointInPolygon(c, metres) && !rooms.some((r) => pointInRoom(c, r))) return c;
  return null;
}

function livingPathD(outlinePts, layout, rooms) {
  const pts = outlinePts || layout.pts;
  if (!pts?.length) return "";
  const parts = [polygonPathD(pts)];
  for (const room of walledRooms(rooms)) {
    const r = roomToPx(room, layout);
    parts.push(
      `M ${r.x} ${r.y} L ${r.x + r.w} ${r.y} L ${r.x + r.w} ${r.y + r.h} L ${r.x} ${r.y + r.h} Z`
    );
  }
  return parts.join(" ");
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

function ceilToStep(m, step = BUILDING_STEP_M) {
  return (Math.ceil(Math.round(m * 1000) / Math.round(step * 1000) - 1e-9) * Math.round(step * 1000)) / 1000;
}

/**
 * Every room box sits on the 100mm grid. The box is the clear room: partition walls are drawn just
 * outside it, so every wall face is on the grid too. Drawn custom benches keep their wall-traced extent.
 */
function snapRoomToGrid(room) {
  if (!room || hasCustomBench(room)) return room;
  const snap = snapMetresToStep;
  const out = { ...room, x: snap(room.x), y: snap(room.y) };
  if (isLaundry(room)) {
    if (laundryLengthIsX(room)) out.w = snapLaundryLength(room.w);
    else out.h = snapLaundryLength(room.h);
    const back = laundryBackSide(room);
    if (back === "bottom") out.y = roundMm(snap(room.y + room.h) - out.h);
    if (back === "right") out.x = roundMm(snap(room.x + room.w) - out.w);
    return out;
  }
  const { minW, minH } = roomMinSize(room);
  out.w = Math.max(ceilToStep(minW), snapMetresToStep(room.w));
  out.h = Math.max(ceilToStep(minH), snapMetresToStep(room.h));
  return out;
}

/**
 * One-off tidy of a saved room onto the grid. Walled rooms saved on the half-step lines (walls centred
 * on their edges) shrink 50mm per side, so their walls stay exactly where they were drawn.
 */
function normaliseRoomToGrid(room) {
  const half = WALL_THICKNESS_M / 2;
  const offGrid = (v) => Math.abs(snapMetresToStep(v) - v) > 1e-6;
  if (!room || hasCustomBench(room) || !roomNeedsPartitionWalls(room) || !(offGrid(room.x) || offGrid(room.y))) {
    return snapRoomToGrid(room);
  }
  const x = offGrid(room.x) ? roundMm(room.x + half) : room.x;
  const y = offGrid(room.y) ? roundMm(room.y + half) : room.y;
  const w = offGrid(room.x) && !isLaundry(room) ? roundMm(room.w - half * 2) : room.w;
  const h = offGrid(room.y) && !isLaundry(room) ? roundMm(room.h - half * 2) : room.h;
  return snapRoomToGrid({ ...room, x, y, w, h });
}

/** Centrelines of every wall a walled room can meet: the external walls and other rooms' partition walls. */
function wallCentreLines(metres, rooms, excludeId, innerMetres) {
  const centre = metres?.length ? insetPolygon(metres, WALL_THICKNESS_M / 2) : null;
  const others = (rooms || []).filter((r) => r.id !== excludeId);
  return [...outlineAxisEdges(centre), ...partitionWallsUncut(others, innerMetres)];
}

/**
 * A walled-room side one grid step off another wall would put two walls side by side; returns the
 * one-step shift (outward) that lands its wall on top of the other so they become one wall.
 */
function mergeWallStep(room, side, lines) {
  const hz = side === "top" || side === "bottom";
  const edge =
    side === "left" ? room.x : side === "right" ? room.x + room.w : side === "top" ? room.y : room.y + room.h;
  const out = side === "left" || side === "top" ? -1 : 1;
  const target = edge + out * (WALL_THICKNESS_M * 1.5);
  const t0 = hz ? room.x : room.y;
  const t1 = hz ? room.x + room.w : room.y + room.h;
  const hit = lines.some(
    (l) =>
      l.axis === (hz ? "h" : "v") &&
      Math.abs((hz ? l.y : l.x) - target) < 0.01 &&
      Math.min(t1, l.t1) - Math.max(t0, l.t0) > WALL_MIN_LEN_M
  );
  return hit ? out * WALL_THICKNESS_M : 0;
}

function mergeRoomWalls(room, lines) {
  if (!roomNeedsPartitionWalls(room) || hasCustomBench(room)) return room;
  const open = isLaundry(room) ? laundryOpenSide(room) : null;
  const step = (side) => (side === open ? 0 : mergeWallStep(room, side, lines));
  const dx = step("left") || step("right");
  const dy = step("top") || step("bottom");
  return dx || dy ? { ...room, x: roundMm(room.x + dx), y: roundMm(room.y + dy) } : room;
}

function mergeRoomSideWall(room, side, lines) {
  if (!roomNeedsPartitionWalls(room) || isLaundry(room)) return room;
  const d = mergeWallStep(room, side, lines);
  if (!d) return room;
  if (side === "left") return { ...room, x: roundMm(room.x + d), w: roundMm(room.w - d) };
  if (side === "right") return { ...room, w: roundMm(room.w + d) };
  if (side === "top") return { ...room, y: roundMm(room.y + d), h: roundMm(room.h - d) };
  return { ...room, h: roundMm(room.h + d) };
}

/** Dragged side lands on a 100mm grid line; the opposite side stays put. */
function snapRoomEdgeToGrid(start, side, next) {
  const snap = snapMetresToStep;
  const { minW, minH } = roomMinSize(start);
  const out = { ...start, ...next };
  if (side === "left") {
    const right = start.x + start.w;
    out.x = Math.min(snap(out.x), snap(right - ceilToStep(minW)));
    out.w = roundMm(right - out.x);
  } else if (side === "right") {
    out.w = Math.max(ceilToStep(minW), roundMm(snap(start.x + out.w) - start.x));
  } else if (side === "top") {
    const bottom = start.y + start.h;
    out.y = Math.min(snap(out.y), snap(bottom - ceilToStep(minH)));
    out.h = roundMm(bottom - out.y);
  } else if (side === "bottom") {
    out.h = Math.max(ceilToStep(minH), roundMm(snap(start.y + out.h) - start.y));
  }
  return out;
}

function snapPointToGrid(p) {
  return { ...p, x: snapMetresToStep(p.x), y: snapMetresToStep(p.y) };
}

function roomRotation(room) {
  const n = ((Number(room?.rot) || 0) % 360 + 360) % 360;
  if (n === 90 || n === 180 || n === 270) return n;
  return 0;
}

function unrotatedSize(room) {
  const rot = roomRotation(room);
  if (rot === 90 || rot === 270) return { w: room.h, h: room.w };
  return { w: room.w, h: room.h };
}

/** Local rect in unrotated room space (origin = unrotated top-left) → world metres. */
function rotatedLocalRect(room, rect) {
  const rot = roomRotation(room);
  const { w: uw, h: uh } = unrotatedSize(room);
  const cx = uw / 2;
  const cy = uh / 2;
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
  ].map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    let rdx = dx;
    let rdy = dy;
    if (rot === 90) {
      rdx = -dy;
      rdy = dx;
    } else if (rot === 180) {
      rdx = -dx;
      rdy = -dy;
    } else if (rot === 270) {
      rdx = dy;
      rdy = -dx;
    }
    return { x: rdx, y: rdy };
  });
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: room.x + room.w / 2 + minX,
    y: room.y + room.h / 2 + minY,
    w: Math.max(...xs) - minX,
    h: Math.max(...ys) - minY,
  };
}

function rotatedLocalPoint(room, p) {
  const rot = roomRotation(room);
  const { w: uw, h: uh } = unrotatedSize(room);
  const dx = p.x - uw / 2;
  const dy = p.y - uh / 2;
  let rdx = dx;
  let rdy = dy;
  if (rot === 90) {
    rdx = -dy;
    rdy = dx;
  } else if (rot === 180) {
    rdx = -dx;
    rdy = -dy;
  } else if (rot === 270) {
    rdx = dy;
    rdy = -dx;
  }
  return { x: room.x + room.w / 2 + rdx, y: room.y + room.h / 2 + rdy };
}

function worldToUnrotatedLocal(room, world) {
  const rot = roomRotation(room);
  const { w: uw, h: uh } = unrotatedSize(room);
  const rdx = world.x - (room.x + room.w / 2);
  const rdy = world.y - (room.y + room.h / 2);
  let dx = rdx;
  let dy = rdy;
  if (rot === 90) {
    dx = rdy;
    dy = -rdx;
  } else if (rot === 180) {
    dx = -rdx;
    dy = -rdy;
  } else if (rot === 270) {
    dx = -rdy;
    dy = rdx;
  }
  return { x: dx + uw / 2, y: dy + uh / 2 };
}

function kitchenRunAlongFromWorld(room, cursorM) {
  const local = worldToUnrotatedLocal(room, cursorM);
  return roomLayoutLongIsX(room) ? local.x : local.y;
}

function startKitchenRunDrag(room, which, cursorM) {
  const { w, h } = unrotatedSize(room);
  const longIsX = roomLayoutLongIsX(room);
  const kind = kitchenLayoutKind(room);
  const side = kitchenWrapSide(kind);
  const run = kitchenRunRange(room, w, h, longIsX, kind, side);
  const t = which === "t0" ? run.t0 : run.t1;
  return {
    mode: "kitchen-run",
    which,
    grabAlong: kitchenRunAlongFromWorld(room, cursorM) - t,
  };
}

function moveKitchenRun(room, which, cursorM, grabAlong) {
  const { w, h } = unrotatedSize(room);
  const longIsX = roomLayoutLongIsX(room);
  const kind = kitchenLayoutKind(room);
  const side = kitchenWrapSide(kind);
  const run = kitchenRunRange(room, w, h, longIsX, kind, side);
  const benchId = kind === "island" ? "island" : "bar";
  const benches = kitchenWorkBenches(room);
  const bench = benches.find((b) => b.id === benchId);
  let min = 0.9;
  if (bench) min = Math.max(min, kitchenPackedLenOnBench(room, bench));
  const t = snapPlanMm(
    kitchenRunAlongFromWorld(room, cursorM) - (Number.isFinite(grabAlong) ? grabAlong : 0)
  );
  let t0 = run.t0;
  let t1 = run.t1;
  const wrap = kitchenHasWrap(kind);
  const wrapStart = wrap && wrapRunFromStart(kind, longIsX);
  if (wrap && ((wrapStart && which === "t0") || (!wrapStart && which === "t1"))) {
    return room;
  }
  if (which === "t0") {
    t0 = Math.max(0, Math.min(t, t1 - min));
    t0 = Math.max(0, Math.min(t0, t1 - min));
  } else {
    t1 = Math.max(t0 + min, Math.min(run.along, t));
    t1 = Math.max(t0 + min, Math.min(run.along, t1));
  }
  if (wrapStart) t0 = 0;
  else if (wrap) t1 = run.along;
  return compactKitchenAppliances({ ...room, kitchenRun0: t0, kitchenRun1: t1 });
}

function rotateRoom90(room, innerMetres) {
  const rot = (roomRotation(room) + 90) % 360;
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;
  const w = room.h;
  const h = room.w;
  const kind = roomKind(room);
  const next = { ...room, rot, x: cx - w / 2, y: cy - h / 2, w, h };
  if (kind === "porch") next.layoutLongIsX = next.w >= next.h;
  else next.layoutLongIsX = roomLayoutLongIsX(room);
  if (kind === "bedroom") {
    next.doorSide = rotateDoorSide(roomDoorSide(room, innerMetres));
    if (
      room.robeSide === "top" ||
      room.robeSide === "right" ||
      room.robeSide === "bottom" ||
      room.robeSide === "left"
    ) {
      next.robeSide = rotateDoorSide(room.robeSide);
    }
    if (
      room.bedSide === "top" ||
      room.bedSide === "right" ||
      room.bedSide === "bottom" ||
      room.bedSide === "left"
    ) {
      next.bedSide = rotateDoorSide(room.bedSide);
    }
  } else if (kind === "bathroom" || kind === "powder") {
    next.doorSide = rotateDoorSide(roomDoorSide(room, innerMetres));
    if (
      room.vanitySide === "top" ||
      room.vanitySide === "right" ||
      room.vanitySide === "bottom" ||
      room.vanitySide === "left"
    ) {
      next.vanitySide = rotateDoorSide(room.vanitySide);
    }
    if (
      room.toiletSide === "top" ||
      room.toiletSide === "right" ||
      room.toiletSide === "bottom" ||
      room.toiletSide === "left"
    ) {
      next.toiletSide = rotateDoorSide(room.toiletSide);
    }
    if (kind === "bathroom") {
      const { shower } = bathroomFixtures(room);
      if (Number.isFinite(Number(room.showerX)) && Number.isFinite(Number(room.showerY))) {
        const rotated = rotateLocalRect90(
          { x: shower.x - room.x, y: shower.y - room.y, w: shower.w, h: shower.h },
          room.w,
          room.h
        );
        next.showerX = snapPlanMm(rotated.x);
        next.showerY = snapPlanMm(rotated.y);
        next.showerRot = (showerRotOf(room) + 1) % 4;
        next.showerLongIsX = next.showerRot % 2 === 0;
      } else {
        next.showerRot = (showerRotOf(room) + 1) % 4;
        next.showerLongIsX = next.showerRot % 2 === 0;
      }
    }
  } else if (kind === "laundryRoom") {
    next.doorSide = rotateDoorSide(roomDoorSide(room, innerMetres));
    if (hasBedroomSide(room.benchSide)) next.benchSide = rotateDoorSide(room.benchSide);
  }
  return next;
}

function roundMm(v) {
  return Math.round(v * 1000) / 1000;
}

function translateDesign(metres, rooms, dx, dy) {
  return {
    metres: metres.map((p) => ({ x: roundMm(p.x + dx), y: roundMm(p.y + dy) })),
    rooms: rooms.map((r) => ({ ...r, x: roundMm(r.x + dx), y: roundMm(r.y + dy) })),
  };
}

/** Rotate the building and every room clockwise by `turns` quarter turns about the plan centre. */
function rotateDesign90(metres, rooms, turns) {
  const n = ((Math.round(turns) % 4) + 4) % 4;
  if (!n || !metres?.length) return { metres, rooms };
  const b = planFootprintBounds(metres, rooms);
  const cx = snapMetresToStep((b.minX + b.maxX) / 2);
  const cy = snapMetresToStep((b.minY + b.maxY) / 2);
  const rot = (x, y) => ({ x: roundMm(cx - (y - cy)), y: roundMm(cy + (x - cx)) });
  let m = metres;
  let rs = rooms;
  for (let k = 0; k < n; k += 1) {
    const inner = insetPolygon(m, WALL_THICKNESS_M) || m;
    rs = rs.map((r) => {
      const next = rotateRoom90(r, inner);
      const c = rot(r.x + r.w / 2, r.y + r.h / 2);
      return { ...next, x: roundMm(c.x - next.w / 2), y: roundMm(c.y - next.h / 2) };
    });
    m = m.map((p) => rot(p.x, p.y));
  }
  return { metres: m, rooms: rs };
}

function designHandlesPx(layout, rooms) {
  const foot = planFootprintBounds(layout.metres, rooms);
  if (!foot) return null;
  const size = handlePx(layout) + 4;
  const off = size / 2 + 10;
  const top = foot.minY * layout.scale + layout.originY - off;
  return {
    size,
    move: { cx: foot.minX * layout.scale + layout.originX - off, cy: top },
    rotate: { cx: foot.maxX * layout.scale + layout.originX + off, cy: top },
    centre: {
      x: ((foot.minX + foot.maxX) / 2) * layout.scale + layout.originX,
      y: ((foot.minY + foot.maxY) / 2) * layout.scale + layout.originY,
    },
  };
}

function hitDesignHandle(layout, rooms, raw) {
  const h = designHandlesPx(layout, rooms);
  if (!h) return null;
  const half = h.size / 2 + 4;
  const near = (p) => Math.abs(raw.x - p.cx) <= half && Math.abs(raw.y - p.cy) <= half;
  if (near(h.move)) return "design-move";
  if (near(h.rotate)) return "design-rotate";
  return null;
}

function WalkMarker({ cx, cy, fill, caption, number, diamond = false }) {
  return (
    <g transform={`translate(${cx} ${cy})`}>
      {diamond ? (
        <polygon points="0,-16 16,0 0,16 -16,0" fill={fill} stroke="#ffffff" strokeWidth="2" />
      ) : (
        <circle r="14" fill={fill} stroke="#ffffff" strokeWidth="2" />
      )}
      {number != null ? (
        <text y="4" textAnchor="middle" fontSize="13" fontWeight="700" fill="#ffffff">
          {number}
        </text>
      ) : (
        <circle r="5" fill="#ffffff" />
      )}
      {caption ? (
        <text y="30" textAnchor="middle" fontSize="12" fontWeight="700" fill={fill}>
          {caption}
        </text>
      ) : null}
    </g>
  );
}

function hitWalkMarker(raw, layout, markers) {
  if (!markers?.start || !layout) return null;
  const candidates = [{ kind: "start", point: markers.start }];
  if (markers.finish) candidates.push({ kind: "finish", point: markers.finish });
  (markers.stops || []).forEach((stop, index) => {
    if (stop) candidates.push({ kind: "stop", index, point: stop });
  });
  let best = null;
  for (const c of candidates) {
    const px = mPointToPx(c.point, layout);
    const d = Math.hypot(raw.x - px.x, raw.y - px.y);
    if (d <= 22 && (!best || d < best.d)) best = { ...c, d };
  }
  return best;
}

function WalkPathOverlay({ layout, markers }) {
  const ordered = [markers.start, ...(markers.stops || []), ...(markers.finish ? [markers.finish] : [])].filter(
    Boolean
  );
  const curve = walkSplinePlanPoints(ordered);
  const pts = (curve.length >= 2 ? curve : ordered).map((p) => mPointToPx(p, layout));
  const startPx = mPointToPx(markers.start, layout);
  const finishPx = markers.finish ? mPointToPx(markers.finish, layout) : null;
  let locationNumber = 0;
  let pointNumber = 0;
  return (
    <g>
      {pts.length >= 2 ? (
        <polyline
          points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="#1f6b4a"
          strokeWidth="2"
          strokeDasharray="7 5"
        />
      ) : null}
      <WalkMarker cx={startPx.x} cy={startPx.y} fill="#1f6b4a" caption="Start" />
      {(markers.stops || []).map((stop, i) => {
        const px = mPointToPx(stop, layout);
        if (stop.kind === "point") {
          pointNumber += 1;
          return (
            <WalkMarker
              key={`walk-stop-${i}`}
              cx={px.x}
              cy={px.y}
              fill="#0f766e"
              number={pointNumber}
              diamond
            />
          );
        }
        locationNumber += 1;
        return (
          <WalkMarker key={`walk-stop-${i}`} cx={px.x} cy={px.y} fill="#1d4f91" number={locationNumber} />
        );
      })}
      {finishPx ? <WalkMarker cx={finishPx.x} cy={finishPx.y} fill="#9a3412" caption="Finish" /> : null}
    </g>
  );
}

function DesignMoveHandle({ cx, cy, size, color }) {
  if (cx == null || cy == null) return null;
  const arm = size * 0.32;
  const head = Math.max(2, size * 0.12);
  return (
    <g>
      <rect
        x={cx - size / 2}
        y={cy - size / 2}
        width={size}
        height={size}
        rx={2}
        fill={WHITE}
        stroke={color}
        strokeWidth="1.5"
      />
      <line x1={cx - arm} y1={cy} x2={cx + arm} y2={cy} stroke={color} strokeWidth="1.3" />
      <line x1={cx} y1={cy - arm} x2={cx} y2={cy + arm} stroke={color} strokeWidth="1.3" />
      <polygon points={`${cx - arm},${cy} ${cx - arm + head},${cy - head} ${cx - arm + head},${cy + head}`} fill={color} />
      <polygon points={`${cx + arm},${cy} ${cx + arm - head},${cy - head} ${cx + arm - head},${cy + head}`} fill={color} />
      <polygon points={`${cx},${cy - arm} ${cx - head},${cy - arm + head} ${cx + head},${cy - arm + head}`} fill={color} />
      <polygon points={`${cx},${cy + arm} ${cx - head},${cy + arm - head} ${cx + head},${cy + arm - head}`} fill={color} />
    </g>
  );
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

/** Axis-aligned envelope of the building polygon plus every room, including porches. */
function planFootprintBounds(metres, rooms) {
  const b = metres?.length ? buildingBounds(metres) : null;
  let minX = b ? b.minX : Infinity;
  let minY = b ? b.minY : Infinity;
  let maxX = b ? b.maxX : -Infinity;
  let maxY = b ? b.maxY : -Infinity;
  for (const r of rooms || []) {
    if (!(r?.w > 0) || !(r?.h > 0)) continue;
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
    if (roomKind(r) === "porch") {
      for (const step of porchStepFlight(r, metres)) {
        minX = Math.min(minX, step.x);
        minY = Math.min(minY, step.y);
        maxX = Math.max(maxX, step.x + step.w);
        maxY = Math.max(maxY, step.y + step.h);
      }
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

function drawBedroomDoorRobe(ctx, geom, layout, bw) {
  if (!geom) return;
  const to = (p) => mPointToPx(p, layout);
  const color = bw ? "#111111" : PLAN_WOOD_EDGE;
  ctx.save();
  if (bw) {
    if (!geom.sliding) {
      const hinge = to(geom.hinge);
      const closed = to(geom.closed);
      const open = to(geom.open);
      const radius = Math.max(1, geom.doorWidth * layout.scale);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(hinge.x, hinge.y);
      ctx.lineTo(open.x, open.y);
      ctx.stroke();
      ctx.beginPath();
      const start = Math.atan2(closed.y - hinge.y, closed.x - hinge.x);
      const end = Math.atan2(open.y - hinge.y, open.x - hinge.x);
      ctx.arc(hinge.x, hinge.y, radius, start, end, !geom.cw);
      ctx.stroke();
    }
    const rr = mRectToPx(geom.robeRect, layout);
    ctx.fillStyle = "transparent";
    ctx.beginPath();
    ctx.rect(rr.x, rr.y, rr.w, rr.h);
    ctx.stroke();
    for (const nib of robeNibRects(geom)) {
      const n = mRectToPx(nib, layout);
      ctx.strokeRect(n.x, n.y, n.w, n.h);
    }
    for (const door of robeSlidingDoorRects(geom)) {
      const d = mRectToPx(door, layout);
      ctx.strokeRect(d.x, d.y, d.w, d.h);
    }
  } else {
    for (const nib of robeNibRects(geom)) {
      const n = mRectToPx(nib, layout);
      ctx.fillStyle = WALL_FILL;
      ctx.fillRect(n.x, n.y, n.w, n.h);
    }
    const rr = mRectToPx(geom.robeRect, layout);
    ctx.fillStyle = PLAN_LINEN;
    ctx.strokeStyle = "#2f2f2f";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.rect(rr.x, rr.y, rr.w, rr.h);
    ctx.fill();
    ctx.stroke();
    for (const door of robeSlidingDoorRects(geom)) {
      const d = robeDoorPx(door, geom, layout);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#2f2f2f";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.rect(d.x, d.y, d.w, d.h);
      ctx.fill();
      ctx.stroke();
    }
    drawPlanDoorSwingCanvas(ctx, geom, layout);
  }
  const dl = to(geom.doorLabel);
  const rl = to(geom.robeLabel);
  const rt = to(geom.robeTitle);
  ctx.font = '700 11px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  drawHaloText(ctx, formatPlanMm(geom.doorWidth), dl.x, dl.y, color, "rgba(255,255,255,0.95)");
  for (const [spot, text] of [
    [rt, "ROBE"],
    [rl, formatPlanMm(geom.robeWidth)],
  ]) {
    ctx.save();
    ctx.translate(spot.x, spot.y);
    if (geom.robeTitle.vertical) ctx.rotate(-Math.PI / 2);
    drawHaloText(ctx, text, 0, 0, color, "rgba(255,255,255,0.95)");
    ctx.restore();
  }
  ctx.restore();
}

function defaultBedPlacement(room) {
  const side = room.w >= room.h ? "top" : "left";
  const frame = roomWallFrame(room, side);
  return { side, along: clampBedAlong(frame.wallLen, (frame.wallLen - BED_SHORT_M) / 2) };
}

/** Bed 1800 along the wall, 2000 into the room; pillow end against the wall. */
function bedroomBed(room) {
  const def = defaultBedPlacement(room);
  const stored = room?.bedSide;
  const bedSide =
    stored === "top" || stored === "right" || stored === "bottom" || stored === "left"
      ? stored
      : def.side;
  const frame = roomWallFrame(room, bedSide);
  const alongLen = BED_SHORT_M;
  const depth = BED_LONG_M;
  const storedAlong = Number(room?.bedAlong);
  const alongM = clampBedAlong(
    frame.wallLen,
    Number.isFinite(storedAlong)
      ? storedAlong
      : def.side === bedSide
        ? def.along
        : (frame.wallLen - alongLen) / 2
  );
  const origin = frame.origin;
  const along = frame.along;
  const inward = frame.inward;
  const bed = wallBoxRect(origin, along, inward, alongM, alongM + alongLen, 0, depth);
  const gap = Math.min(0.08, alongLen * 0.12);
  const pillowAlong = Math.min(0.58, Math.max(0.18, (alongLen - gap) * 0.42));
  const used = pillowAlong * 2 + gap;
  const start = alongM + Math.max(0, (alongLen - used) / 2);
  const pillowDepth = Math.min(0.36, Math.max(0.22, depth * 0.18));
  const pillowInset = 0.05;
  const pillows = [
    wallBoxRect(
      origin,
      along,
      inward,
      start,
      start + pillowAlong,
      pillowInset,
      pillowInset + pillowDepth
    ),
    wallBoxRect(
      origin,
      along,
      inward,
      start + pillowAlong + gap,
      start + pillowAlong + gap + pillowAlong,
      pillowInset,
      pillowInset + pillowDepth
    ),
  ];
  const nsGap = NIGHTSTAND_GAP_M;
  const nsSize = NIGHTSTAND_M;
  const nightstands = [];
  const sideSpaces = [
    { start: alongM - nsGap, dir: -1 },
    { start: alongM + alongLen + nsGap, dir: 1 },
  ];
  for (const slot of sideSpaces) {
    const t0 = slot.dir < 0 ? slot.start - nsSize : slot.start;
    const t1 = t0 + nsSize;
    nightstands.push(wallBoxRect(origin, along, inward, t0, t1, 0.02, 0.02 + nsSize));
  }
  const duvetInset = 0.055;
  const duvet = {
    x: bed.x + duvetInset,
    y: bed.y + duvetInset,
    w: Math.max(0.2, bed.w - duvetInset * 2),
    h: Math.max(0.2, bed.h - duvetInset * 2),
  };
  const runner = footStripRect(bed, bedSide, 0.28, duvetInset + 0.01);
  const foldThick = 0.02;
  const fold = footStripRect(bed, bedSide, foldThick, duvetInset + 0.02);
  if (fold) {
    if (bedSide === "top") fold.y = bed.y + depth * 0.4;
    else if (bedSide === "bottom") fold.y = bed.y + bed.h - depth * 0.4 - foldThick;
    else if (bedSide === "left") fold.x = bed.x + depth * 0.4;
    else fold.x = bed.x + bed.w - depth * 0.4 - foldThick;
  }
  const group = unionRects([bed, ...nightstands]);
  return {
    bedSide,
    along,
    inward,
    alongM,
    alongLen,
    depth,
    bed,
    pillows,
    rug: null,
    duvet,
    runner,
    fold,
    nightstands,
    group,
    grab: rectCenter(group || bed),
    anchor: {
      x: origin.x + along.x * alongM,
      y: origin.y + along.y * alongM,
    },
  };
}

function bedLayout(room, innerMetres) {
  const geom = bedroomBed(room, innerMetres);
  return {
    bed: geom.bed,
    pillow: geom.pillows[0],
    pillows: geom.pillows,
    rug: geom.rug,
    duvet: geom.duvet,
    runner: geom.runner,
    fold: geom.fold,
    nightstands: geom.nightstands,
    group: geom.group,
    bedSide: geom.bedSide,
  };
}

function PlanNightstand({ rect, layout }) {
  if (!rect) return null;
  const p = mRectToPx(rect, layout);
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  const r = Math.min(p.w, p.h) * 0.28;
  return (
    <g>
      <rect
        x={p.x}
        y={p.y}
        width={p.w}
        height={p.h}
        rx={Math.max(1.5, layout.scale * 0.03)}
        fill={PLAN_WOOD}
        stroke={PLAN_WOOD_EDGE}
        strokeWidth="1"
      />
      <circle cx={cx} cy={cy} r={r} fill={PLAN_LAMP} stroke={PLAN_WOOD_DARK} strokeWidth="0.7" />
    </g>
  );
}

function planPolyPoints(pts, layout) {
  return (pts || [])
    .map((p) => {
      const q = mPointToPx(p, layout);
      return `${q.x},${q.y}`;
    })
    .join(" ");
}

function PlanSlidingDoor({ door, layout }) {
  if (!door?.sliding || !door.cavityQuad || !door.leafQuad) return null;
  const pocket = Math.hypot(door.cavityQuad[1].x - door.cavityQuad[0].x, door.cavityQuad[1].y - door.cavityQuad[0].y);
  return (
    <g style={{ pointerEvents: "none" }}>
      {pocket > 0.02 ? (
        <polygon
          points={planPolyPoints(door.cavityQuad, layout)}
          fill="#f4f1ea"
          stroke={WALL_FILL}
          strokeWidth="1"
        />
      ) : null}
      <polygon
        points={planPolyPoints(door.leafQuad, layout)}
        fill={PLAN_WOOD}
        stroke={PLAN_WOOD_EDGE}
        strokeWidth="1"
      />
    </g>
  );
}

function PlanDoorSwing({ hinge, closed, open, radius, cw, layout }) {
  if (!hinge || !closed || !open) return null;
  const sweep = cw ? 1 : 0;
  const leaf = doorLeafQuad(hinge, open, doorLeafThicknessPx(layout), closed);
  return (
    <g>
      <path
        d={`M ${closed.x} ${closed.y} A ${radius} ${radius} 0 0 ${sweep} ${open.x} ${open.y}`}
        fill="none"
        stroke={WALL_FILL}
        strokeWidth="1.15"
        strokeDasharray="5 4"
        strokeLinecap="round"
      />
      <polygon
        points={leaf.map((p) => `${p.x},${p.y}`).join(" ")}
        fill={PLAN_WOOD}
        stroke={PLAN_WOOD_EDGE}
        strokeWidth="1"
      />
    </g>
  );
}

function PlanWoodRobe({ geom, layout }) {
  if (!geom?.robeRect) return null;
  const r = mRectToPx(geom.robeRect, layout);
  return (
    <g>
      {robeNibRects(geom).map((nib, i) => {
        const p = mRectToPx(nib, layout);
        return (
          <rect
            key={`robe-nib-${i}`}
            x={p.x}
            y={p.y}
            width={p.w}
            height={p.h}
            fill={WALL_FILL}
          />
        );
      })}
      <rect
        x={r.x}
        y={r.y}
        width={r.w}
        height={r.h}
        fill={PLAN_LINEN}
        stroke="#2f2f2f"
        strokeWidth="1.1"
      />
      {robeSlidingDoorRects(geom).map((door, i) => {
        const p = robeDoorPx(door, geom, layout);
        return (
          <rect
            key={`robe-door-${i}`}
            x={p.x}
            y={p.y}
            width={Math.max(1, p.w)}
            height={Math.max(1, p.h)}
            fill="#ffffff"
            stroke="#2f2f2f"
            strokeWidth="1.1"
          />
        );
      })}
    </g>
  );
}

function BedroomFixtures({ room, layout, innerMetres, showHandles = false }) {
  const { bed, pillows, duvet, runner, fold, nightstands, group } = bedLayout(room, innerMetres);
  const geom = bedroomDoorAndRobe(room, innerMetres);
  const b = mRectToPx(bed, layout);
  const duvetPx = duvet ? mRectToPx(duvet, layout) : null;
  const runnerPx = runner ? mRectToPx(runner, layout) : null;
  const foldPx = fold ? mRectToPx(fold, layout) : null;
  const pillowPx = (pillows || []).map((p) => mRectToPx(p, layout));
  const frameRad = Math.max(2, layout.scale * 0.04);
  const linenRad = Math.max(2, layout.scale * 0.05);
  const color = PLAN_WOOD_EDGE;
  const hinge = geom ? mPointToPx(geom.hinge, layout) : null;
  const closed = geom ? mPointToPx(geom.closed, layout) : null;
  const open = geom ? mPointToPx(geom.open, layout) : null;
  const doorLabel = geom ? mPointToPx(geom.doorLabel, layout) : null;
  const robeLabel = geom ? mPointToPx(geom.robeLabel, layout) : null;
  const robeTitle = geom ? mPointToPx(geom.robeTitle, layout) : null;
  const doorGrab = geom ? mPointToPx(geom.doorGrab, layout) : null;
  const doorOptions = geom ? doorOptionsHandlePx(geom, layout) : null;
  const robeGrab = geom ? mPointToPx(geom.robeGrab, layout) : null;
  const bedGrab = mPointToPx(rectCenter(group || bed), layout);
  const hs = fixtureGrabPx(layout);
  const radius = geom ? Math.max(1, geom.doorWidth * layout.scale) : 0;
  return (
    <g>
      {(nightstands || []).map((ns, i) => (
        <PlanNightstand key={`ns-${i}`} rect={ns} layout={layout} />
      ))}
      <rect
        x={b.x}
        y={b.y}
        width={b.w}
        height={b.h}
        rx={frameRad}
        fill={PLAN_WOOD}
        stroke={PLAN_WOOD_EDGE}
        strokeWidth="1.2"
      />
      {duvetPx ? (
        <rect
          x={duvetPx.x}
          y={duvetPx.y}
          width={duvetPx.w}
          height={duvetPx.h}
          rx={linenRad}
          fill={PLAN_LINEN}
          stroke={PLAN_LINEN_EDGE}
          strokeWidth="1"
        />
      ) : null}
      {foldPx ? (
        <rect
          x={foldPx.x}
          y={foldPx.y}
          width={foldPx.w}
          height={foldPx.h}
          fill={PLAN_LINEN_EDGE}
        />
      ) : null}
      {runnerPx ? (
        <rect
          x={runnerPx.x}
          y={runnerPx.y}
          width={runnerPx.w}
          height={runnerPx.h}
          fill={PLAN_RUNNER}
          stroke={PLAN_WOOD_DARK}
          strokeWidth="0.8"
        />
      ) : null}
      {pillowPx.map((p, i) => (
        <rect
          key={`pillow-${i}`}
          x={p.x}
          y={p.y}
          width={p.w}
          height={p.h}
          rx={linenRad * 0.7}
          fill="#fbfaf6"
          stroke="#c5bfb4"
          strokeWidth="1"
        />
      ))}
      {geom ? <PlanWoodRobe geom={geom} layout={layout} /> : null}
      {geom && robeTitle ? (
        <text
            x={robeTitle.x}
            y={robeTitle.y}
            fill={color}
            fontSize="11"
            fontWeight="700"
            textAnchor="middle"
            dominantBaseline="middle"
            transform={
              geom.robeTitle.vertical
                ? `rotate(-90 ${robeTitle.x} ${robeTitle.y})`
                : undefined
            }
            style={{ pointerEvents: "none" }}
          >
            ROBE
          </text>
      ) : null}
      {geom && robeLabel ? (
        <text
          x={robeLabel.x}
          y={robeLabel.y}
          fill={color}
          fontSize="11"
          fontWeight="700"
          textAnchor="middle"
          dominantBaseline="middle"
          transform={geom.robeLabel.vertical ? `rotate(-90 ${robeLabel.x} ${robeLabel.y})` : undefined}
          style={{ pointerEvents: "none" }}
        >
          {formatPlanMm(geom.robeWidth)}
        </text>
      ) : null}
      {geom?.sliding ? null : (
        <PlanDoorSwing
          hinge={hinge}
          closed={closed}
          open={open}
          radius={radius}
          cw={geom?.cw}
          layout={layout}
        />
      )}
      {geom && doorLabel ? (
        <text
          x={doorLabel.x}
          y={doorLabel.y}
          fill={color}
          fontSize="11"
          fontWeight="700"
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ pointerEvents: "none" }}
        >
          {formatPlanMm(geom.doorWidth)}
        </text>
      ) : null}
      {showHandles ? (
        <>
          <GrabSquare cx={bedGrab.x} cy={bedGrab.y} size={hs} color={PLAN_WOOD_EDGE} />
          <GrabSquare cx={robeGrab?.x} cy={robeGrab?.y} size={hs} color={color} />
          {geom
            ? robeResizeHandles(geom).map((h) => {
                const p = mPointToPx(h.point, layout);
                return (
                  <AxisHandle
                    key={`robe-size-${h.which}`}
                    cx={p.x}
                    cy={p.y}
                    size={hs}
                    color={color}
                    axis={robeResizeAxis(geom)}
                  />
                );
              })
            : null}
          <GrabSquare cx={doorGrab?.x} cy={doorGrab?.y} size={hs} color={color} />
          {doorOptions ? (
            <OptionsHandle cx={doorOptions.cx} cy={doorOptions.cy} size={doorOptions.size} color={color} />
          ) : null}
          {open ? <MirrorHandle cx={open.x} cy={open.y} size={hs} color={color} /> : null}
        </>
      ) : null}
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
  const toiletGeom = bathroomToilet(room);
  let shower = null;
  if (bathroomHasShower(room)) {
    const longIsX = showerLongAxis(room);
    const len = showerLengthM(room, longIsX ? room.w : room.h);
    const wide = Math.min(SHOWER_SHORT_M, longIsX ? room.h : room.w);
    const def = defaultBathroomLayout(room.w, room.h);
    shower = applyStoredRoomRect(room, "showerX", "showerY", {
      x: room.x + def.showerX,
      y: room.y + def.showerY,
      w: longIsX ? len : wide,
      h: longIsX ? wide : len,
    });
  }
  return {
    shower,
    tank: toiletGeom?.tank,
    bowl: toiletGeom?.bowl,
    clear: toiletGeom?.clear,
    toilet: toiletGeom?.rect,
    toiletGeom,
  };
}

function bathroomTileModule(room) {
  const longIsX = room.w >= room.h;
  return {
    tw: longIsX ? TILE_LONG_M : TILE_SHORT_M,
    th: longIsX ? TILE_SHORT_M : TILE_LONG_M,
  };
}

function bathroomTileRects(room, groutM = 0.003) {
  const { tw, th } = bathroomTileModule(room);
  const g = groutM;
  const x0 = room.x;
  const y0 = room.y;
  const x1 = room.x + room.w;
  const y1 = room.y + room.h;
  const rects = [];
  for (let y = y0; y < y1 - 1e-9; y += th) {
    const yb = Math.min(y + th, y1);
    for (let x = x0; x < x1 - 1e-9; x += tw) {
      const xb = Math.min(x + tw, x1);
      if (xb - x < 0.04 || yb - y < 0.04) continue;
      rects.push({
        x: x + g / 2,
        y: y + g / 2,
        w: Math.max(0.02, xb - x - g),
        h: Math.max(0.02, yb - y - g),
      });
    }
  }
  return rects;
}

function bathroomTileGroutM(layout) {
  return Math.max(0.002, 0.7 / Math.max(1, layout.scale));
}

function drawBathroomTiles(ctx, room, layout) {
  const floor = mRectToPx({ x: room.x, y: room.y, w: room.w, h: room.h }, layout);
  ctx.save();
  ctx.beginPath();
  ctx.rect(floor.x, floor.y, floor.w, floor.h);
  ctx.clip();
  ctx.fillStyle = BATH_GROUT;
  ctx.fillRect(floor.x, floor.y, floor.w, floor.h);
  ctx.fillStyle = BATH_TILE;
  for (const tile of bathroomTileRects(room, bathroomTileGroutM(layout))) {
    const p = mRectToPx(tile, layout);
    ctx.fillRect(p.x, p.y, p.w, p.h);
  }
  ctx.restore();
}

function hybridPlankAlongX(metres) {
  if (!metres?.length) return true;
  const b = buildingBounds(metres);
  return b.maxX - b.minX >= b.maxY - b.minY;
}

function carpetNoise(i, j) {
  const s = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function drawHybridPlanks(ctx, layout) {
  const alongX = hybridPlankAlongX(layout.metres);
  const pitch = HYBRID_PLANK_M * layout.scale;
  const gap = Math.max(0.55, HYBRID_GAP_M * layout.scale);
  const ox = layout.originX;
  const oy = layout.originY;
  const b = layout.metres?.length ? buildingBounds(layout.metres) : { minX: 0, minY: 0, maxX: 20, maxY: 20 };
  const pad = pitch * 2;
  const minX = b.minX * layout.scale + ox - pad;
  const minY = b.minY * layout.scale + oy - pad;
  const maxX = b.maxX * layout.scale + ox + pad;
  const maxY = b.maxY * layout.scale + oy + pad;
  ctx.fillStyle = HYBRID_GAP;
  ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
  if (alongX) {
    const yStart = oy + Math.floor((minY - oy) / pitch) * pitch;
    let i = Math.round((yStart - oy) / pitch);
    for (let y = yStart; y < maxY + pitch; y += pitch, i += 1) {
      ctx.fillStyle = HYBRID_PLANKS[((i % HYBRID_PLANKS.length) + HYBRID_PLANKS.length) % HYBRID_PLANKS.length];
      ctx.fillRect(minX, y + gap / 2, maxX - minX, Math.max(0.5, pitch - gap));
      ctx.strokeStyle = "rgba(180, 158, 120, 0.28)";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(minX, y + pitch * 0.38);
      ctx.lineTo(maxX, y + pitch * 0.38);
      ctx.stroke();
    }
  } else {
    const xStart = ox + Math.floor((minX - ox) / pitch) * pitch;
    let i = Math.round((xStart - ox) / pitch);
    for (let x = xStart; x < maxX + pitch; x += pitch, i += 1) {
      ctx.fillStyle = HYBRID_PLANKS[((i % HYBRID_PLANKS.length) + HYBRID_PLANKS.length) % HYBRID_PLANKS.length];
      ctx.fillRect(x + gap / 2, minY, Math.max(0.5, pitch - gap), maxY - minY);
      ctx.strokeStyle = "rgba(180, 158, 120, 0.28)";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(x + pitch * 0.38, minY);
      ctx.lineTo(x + pitch * 0.38, maxY);
      ctx.stroke();
    }
  }
}

function drawCarpetFloor(ctx, room, layout) {
  const r = mRectToPx({ x: room.x, y: room.y, w: room.w, h: room.h }, layout);
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.fillStyle = CARPET_BASE;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  const step = Math.max(2.2, Math.min(4.8, 0.02 * layout.scale));
  const cols = Math.ceil(r.w / step);
  const rows = Math.ceil(r.h / step);
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const n = carpetNoise(i, j);
      ctx.fillStyle =
        n < 0.34 ? "rgba(160,160,160,0.28)" : n < 0.67 ? "rgba(230,230,230,0.24)" : "rgba(176,176,176,0.18)";
      ctx.fillRect(r.x + i * step, r.y + j * step, step + 0.4, step + 0.4);
    }
  }
  ctx.restore();
}

function FloorFinishDefs({ prefix, layout }) {
  if (!layout) return null;
  const alongX = hybridPlankAlongX(layout.metres);
  const pitch = HYBRID_PLANK_M * layout.scale;
  const gap = Math.max(0.55, HYBRID_GAP_M * layout.scale);
  const n = HYBRID_PLANKS.length;
  const pitchN = pitch * n;
  const grain = Math.max(28, 0.7 * layout.scale);
  return (
    <>
      <pattern
        id={`${prefix}-hybrid`}
        patternUnits="userSpaceOnUse"
        x={layout.originX}
        y={layout.originY}
        width={alongX ? grain : pitchN}
        height={alongX ? pitchN : grain}
      >
        <rect width="100%" height="100%" fill={HYBRID_GAP} />
        {HYBRID_PLANKS.map((fill, i) =>
          alongX ? (
            <g key={i}>
              <rect
                x="0"
                y={i * pitch + gap / 2}
                width={grain}
                height={Math.max(0.5, pitch - gap)}
                fill={fill}
              />
              <line
                x1="0"
                y1={i * pitch + pitch * 0.38}
                x2={grain}
                y2={i * pitch + pitch * 0.38}
                stroke="#c4ae88"
                strokeWidth="0.65"
                opacity="0.32"
              />
            </g>
          ) : (
            <g key={i}>
              <rect
                x={i * pitch + gap / 2}
                y="0"
                width={Math.max(0.5, pitch - gap)}
                height={grain}
                fill={fill}
              />
              <line
                x1={i * pitch + pitch * 0.38}
                y1="0"
                x2={i * pitch + pitch * 0.38}
                y2={grain}
                stroke="#c4ae88"
                strokeWidth="0.65"
                opacity="0.32"
              />
            </g>
          )
        )}
      </pattern>
      <pattern
        id={`${prefix}-carpet`}
        patternUnits="userSpaceOnUse"
        x={layout.originX}
        y={layout.originY}
        width="11"
        height="11"
      >
        <rect width="11" height="11" fill={CARPET_BASE} />
        <circle cx="2.1" cy="2.6" r="1.15" fill={CARPET_SHADOW} opacity="0.3" />
        <circle cx="7.2" cy="1.8" r="0.95" fill={CARPET_HIGHLIGHT} opacity="0.34" />
        <circle cx="4.4" cy="6.8" r="1.1" fill={CARPET_SHADOW} opacity="0.22" />
        <circle cx="9.1" cy="8.2" r="0.9" fill={CARPET_HIGHLIGHT} opacity="0.28" />
        <circle cx="1.3" cy="8.8" r="0.75" fill="#b0b0b0" opacity="0.2" />
        <circle cx="8.4" cy="4.6" r="0.7" fill="#b8b8b8" opacity="0.18" />
      </pattern>
      <filter
        id={`${prefix}-carpet-n`}
        x="0%"
        y="0%"
        width="100%"
        height="100%"
        colorInterpolationFilters="sRGB"
      >
        <feTurbulence type="fractalNoise" baseFrequency="0.92 1.18" numOctaves="4" seed="4" result="noise" />
        <feColorMatrix
          in="noise"
          type="matrix"
          values="0 0 0 0 0.78  0 0 0 0 0.78  0 0 0 0 0.78  0 0 0 0.45 0"
        />
      </filter>
    </>
  );
}

function roomFloorFill(kind, prefix, colors) {
  if (kind === "bathroom" || kind === "porch") return colors.fill;
  if (kind === "bedroom") return `url(#${prefix}-carpet)`;
  return `url(#${prefix}-hybrid)`;
}

function BathroomTileFloor({ room, layout }) {
  const floor = mRectToPx({ x: room.x, y: room.y, w: room.w, h: room.h }, layout);
  const clipId = `qc-bath-tile-${room.id}`;
  const groutM = bathroomTileGroutM(layout);
  return (
    <g pointerEvents="none">
      <defs>
        <clipPath id={clipId}>
          <rect x={floor.x} y={floor.y} width={floor.w} height={floor.h} />
        </clipPath>
      </defs>
      <rect x={floor.x} y={floor.y} width={floor.w} height={floor.h} fill={BATH_GROUT} />
      <g clipPath={`url(#${clipId})`}>
        {bathroomTileRects(room, groutM).map((tile, i) => {
          const p = mRectToPx(tile, layout);
          return (
            <rect
              key={`tile-${i}`}
              x={p.x}
              y={p.y}
              width={Math.max(0.5, p.w)}
              height={Math.max(0.5, p.h)}
              fill={BATH_TILE}
            />
          );
        })}
      </g>
    </g>
  );
}

function ShowerHeadAndGlass({ shower, room, layout, walls }) {
  const rot = showerRotOf(room);
  const parts = showerPlanParts(shower, rot, walls);
  const glass = glassPanelPx(parts.glass, parts.side, layout);
  const head = mPointToPx(parts.head, layout);
  const headR = Math.max(3.5, 0.07 * layout.scale);
  const spray = Math.max(6, 0.12 * layout.scale);
  const rays = [-0.45, 0, 0.45].map((spread) => {
    const dx = parts.aim.x * Math.cos(spread) - parts.aim.y * Math.sin(spread);
    const dy = parts.aim.x * Math.sin(spread) + parts.aim.y * Math.cos(spread);
    return {
      x1: head.x + dx * headR * 1.15,
      y1: head.y + dy * headR * 1.15,
      x2: head.x + dx * (headR + spray),
      y2: head.y + dy * (headR + spray),
    };
  });
  return (
    <g pointerEvents="none">
      <rect
        x={glass.x}
        y={glass.y}
        width={Math.max(1, glass.w)}
        height={Math.max(1, glass.h)}
        fill="rgba(120, 168, 186, 0.88)"
        stroke="#5d7e8c"
        strokeWidth="1.4"
      />
      <circle cx={head.x} cy={head.y} r={headR} fill="#ffffff" stroke={PLAN_CERAMIC_EDGE} strokeWidth="1.3" />
      <circle cx={head.x} cy={head.y} r={Math.max(1.2, headR * 0.28)} fill={PLAN_CERAMIC_EDGE} />
      {rays.map((ray, i) => (
        <line
          key={`spray-${i}`}
          x1={ray.x1}
          y1={ray.y1}
          x2={ray.x2}
          y2={ray.y2}
          stroke={PLAN_CERAMIC_EDGE}
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      ))}
    </g>
  );
}

function BathroomFixtures({ room, layout, innerMetres, walls, showHandles = false }) {
  const { shower, tank, bowl, clear, toilet, toiletGeom } = bathroomFixtures(room);
  const door = roomDoorSwing(room, innerMetres);
  const vanity = bathroomVanity(room, innerMetres);
  const s = shower ? mRectToPx(shower, layout) : null;
  const t = tank ? mRectToPx(tank, layout) : null;
  const b = bowl ? mRectToPx(bowl, layout) : null;
  const c = clear ? mRectToPx(clear, layout) : null;
  const v = vanity ? mRectToPx(vanity.rect, layout) : null;
  const basin = vanity ? mRectToPx(vanity.basin, layout) : null;
  const wm = vanity?.wm ? mRectToPx(vanity.wm.rect, layout) : null;
  const vanityOptions = vanityOptionsHandlePx(vanity, layout);
  const hinge = door ? mPointToPx(door.hinge, layout) : null;
  const closed = door ? mPointToPx(door.closed, layout) : null;
  const open = door ? mPointToPx(door.open, layout) : null;
  const doorLabel = door ? mPointToPx(door.doorLabel, layout) : null;
  const doorGrab = door ? mPointToPx(door.doorGrab, layout) : null;
  const doorOptions = door ? doorOptionsHandlePx(door, layout) : null;
  const vanityGrab = vanity ? mPointToPx(vanity.grab, layout) : null;
  const showerGrab = shower ? mPointToPx(rectCenter(shower), layout) : null;
  const showerRotate = shower ? fixtureRotateHandlePx(shower, layout) : null;
  const toiletGrab = toilet ? mPointToPx(rectCenter(toilet), layout) : null;
  const hs = fixtureGrabPx(layout);
  const drainR = s ? Math.max(2, Math.min(s.w, s.h) * 0.07) : 0;
  const waste = s ? { x: s.x + s.w / 2, y: s.y + s.h / 2 } : null;
  const wasteCorners = s
    ? [
        { x: s.x, y: s.y },
        { x: s.x + s.w, y: s.y },
        { x: s.x + s.w, y: s.y + s.h },
        { x: s.x, y: s.y + s.h },
      ]
    : [];
  const color = PLAN_WOOD_EDGE;
  const vanityColor = PLAN_CERAMIC_EDGE;
  const radius = door ? Math.max(1, door.doorWidth * layout.scale) : 0;
  const bowlFront = toiletBowlFront(toiletGeom?.toiletSide);
  return (
    <g>
      {roomKind(room) === "bathroom" ? <BathroomTileFloor room={room} layout={layout} /> : null}
      {s ? (
        <>
          <rect
            x={s.x}
            y={s.y}
            width={s.w}
            height={s.h}
            fill={PLAN_GLASS}
            stroke={PLAN_CERAMIC_EDGE}
            strokeWidth="1.25"
          />
          {wasteCorners.map((pt, i) => (
            <line
              key={`waste-${i}`}
              x1={pt.x}
              y1={pt.y}
              x2={waste.x}
              y2={waste.y}
              stroke={PLAN_CERAMIC_EDGE}
              strokeWidth="1"
              strokeDasharray="4 3"
            />
          ))}
          <circle
            cx={waste.x}
            cy={waste.y}
            r={drainR}
            fill="none"
            stroke={PLAN_CERAMIC_EDGE}
            strokeWidth="1.1"
          />
          <circle
            cx={waste.x}
            cy={waste.y}
            r={Math.max(1, drainR * 0.35)}
            fill={PLAN_CERAMIC_EDGE}
          />
          <ShowerHeadAndGlass shower={shower} room={room} layout={layout} walls={walls} />
        </>
      ) : null}
      {v ? (
        <>
          <rect
            x={v.x}
            y={v.y}
            width={v.w}
            height={v.h}
            fill="#ffffff"
            stroke={PLAN_CERAMIC_EDGE}
            strokeWidth="1.2"
          />
          <ellipse
            cx={basin.x + basin.w / 2}
            cy={basin.y + basin.h / 2}
            rx={basin.w / 2}
            ry={basin.h / 2}
            fill="#ffffff"
            stroke={vanityColor}
            strokeWidth="1.1"
          />
        </>
      ) : null}
      {wm ? (
        <>
          <rect
            x={wm.x}
            y={wm.y}
            width={wm.w}
            height={wm.h}
            fill="none"
            stroke="#2f2f2f"
            strokeWidth="1.1"
            strokeDasharray="5 4"
          />
          <text
            x={wm.x + Math.max(3, wm.w * 0.08)}
            y={wm.y + wm.h - Math.max(3, wm.h * 0.08)}
            fill="#2f2f2f"
            fontSize={wmLabelPx(wm)}
            fontWeight="700"
            textAnchor="start"
            dominantBaseline="alphabetic"
            style={{ pointerEvents: "none" }}
          >
            WM
          </text>
        </>
      ) : null}
      {c ? (
        <rect
          x={c.x}
          y={c.y}
          width={c.w}
          height={c.h}
          fill="none"
          stroke={PLAN_CERAMIC_EDGE}
          strokeWidth="1.15"
          strokeDasharray="5 4"
          strokeLinecap="round"
        />
      ) : null}
      {t && b ? (
        <>
          <path
            d={roundedFrontPathD(b, bowlFront)}
            fill={PLAN_CERAMIC}
            stroke={PLAN_CERAMIC_EDGE}
            strokeWidth="1.2"
          />
          <rect
            x={t.x}
            y={t.y}
            width={t.w}
            height={t.h}
            fill={PLAN_CERAMIC}
            stroke={PLAN_CERAMIC_EDGE}
            strokeWidth="1.2"
          />
        </>
      ) : null}
      {door?.sliding ? null : (
        <PlanDoorSwing
          hinge={hinge}
          closed={closed}
          open={open}
          radius={radius}
          cw={door?.cw}
          layout={layout}
        />
      )}
      {door && doorLabel ? (
        <text
          x={doorLabel.x}
          y={doorLabel.y}
          fill={color}
          fontSize="11"
          fontWeight="700"
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ pointerEvents: "none" }}
        >
          {formatPlanMm(door.doorWidth)}
        </text>
      ) : null}
      {showHandles ? (
        <>
          {showerGrab ? (
            <GrabSquare cx={showerGrab.x} cy={showerGrab.y} size={hs} color={PLAN_CERAMIC_EDGE} />
          ) : null}
          {toiletGrab ? (
            <GrabSquare cx={toiletGrab.x} cy={toiletGrab.y} size={hs} color={PLAN_CERAMIC_EDGE} />
          ) : null}
          <GrabSquare cx={vanityGrab?.x} cy={vanityGrab?.y} size={hs} color={vanityColor} />
          {vanityOptions ? (
            <OptionsHandle
              cx={vanityOptions.cx}
              cy={vanityOptions.cy}
              size={vanityOptions.size}
              color={vanityColor}
            />
          ) : null}
          <GrabSquare cx={doorGrab?.x} cy={doorGrab?.y} size={hs} color={color} />
          {doorOptions ? (
            <OptionsHandle cx={doorOptions.cx} cy={doorOptions.cy} size={doorOptions.size} color={color} />
          ) : null}
          {shower
            ? showerResizeHandles(shower, room).map((h) => {
                const p = mPointToPx(h.point, layout);
                return (
                  <AxisHandle
                    key={`shower-size-${h.which}`}
                    cx={p.x}
                    cy={p.y}
                    size={hs}
                    color={PLAN_CERAMIC_EDGE}
                    axis={showerLongAxis(room) ? "ew" : "ns"}
                  />
                );
              })
            : null}
          {showerRotate ? (
            <RotateHandle
              cx={showerRotate.cx}
              cy={showerRotate.cy}
              size={showerRotate.size}
              color={PLAN_CERAMIC_EDGE}
            />
          ) : null}
          {open ? <MirrorHandle cx={open.x} cy={open.y} size={hs} color={color} /> : null}
        </>
      ) : null}
    </g>
  );
}

function KitchenSinkGraphic({ W, H, mirror }) {
  const sid = useSilverId();
  const p = kitchenSinkParts(W, H, mirror);
  const grooves = kitchenSinkGrooves(p);
  const bowls = [
    { x: p.bowl1X, w: p.bowl1W },
    { x: p.bowl2X, w: p.bowl2W },
  ];
  return (
    <g>
      <SilverGradients id={sid} />
      <rect
        x={0}
        y={0}
        width={W}
        height={H}
        rx={p.outerRx}
        fill={`url(#${sid}-plate)`}
        stroke={PLAN_STEEL_EDGE}
        strokeWidth="1.1"
      />
      {grooves.map((g, i) => (
        <line
          key={`groove-${i}`}
          x1={g.x1}
          y1={g.y}
          x2={g.x2}
          y2={g.y}
          stroke={PLAN_STEEL_GROOVE}
          strokeWidth={Math.max(0.8, H * 0.028)}
          strokeLinecap="round"
        />
      ))}
      {bowls.map((b, i) => {
        const cx = b.x + b.w / 2;
        const cy = p.bowlY + p.bowlH * 0.58;
        return (
          <g key={`bowl-${i}`}>
            <rect
              x={b.x}
              y={p.bowlY}
              width={b.w}
              height={p.bowlH}
              rx={p.rx}
              fill={`url(#${sid}-bowl)`}
              stroke={PLAN_STEEL_EDGE}
              strokeWidth="1.1"
            />
            <circle cx={cx} cy={cy} r={p.drainR} fill="none" stroke={PLAN_STEEL_EDGE} strokeWidth="1" />
            <circle cx={cx} cy={cy} r={p.drainR * 0.28} fill={PLAN_STEEL_EDGE} />
          </g>
        );
      })}
      <circle
        cx={p.tapX}
        cy={p.tapY}
        r={p.tapR}
        fill={`url(#${sid}-plate)`}
        stroke={PLAN_STEEL_EDGE}
        strokeWidth="1"
      />
    </g>
  );
}

function KitchenSink({ room, layout, sinkLocal }) {
  const frame = kitchenSinkFramePx(room, layout, sinkLocal);
  if (!frame) return null;
  const { o, a, c, W, H } = frame;
  return (
    <g
      transform={`matrix(${(a.x - o.x) / W} ${(a.y - o.y) / W} ${(c.x - o.x) / H} ${
        (c.y - o.y) / H
      } ${o.x} ${o.y})`}
    >
      <KitchenSinkGraphic W={W} H={H} mirror={sinkMirrored(room)} />
    </g>
  );
}

function LaundryFixtures({ room, layout, innerMetres }) {
  const sid = useSilverId();
  const { wm, trough, basin } = laundryFixtures(room, innerMetres);
  const w = mRectToPx(wm, layout);
  const t = mRectToPx(trough, layout);
  const b = mRectToPx(basin, layout);
  return (
    <g pointerEvents="none">
      <SilverGradients id={sid} />
      <rect
        x={t.x}
        y={t.y}
        width={t.w}
        height={t.h}
        fill={`url(#${sid}-plate)`}
        stroke={PLAN_STEEL_EDGE}
        strokeWidth="1.1"
      />
      <rect
        x={b.x}
        y={b.y}
        width={b.w}
        height={b.h}
        rx={Math.max(2, layout.scale * 0.04)}
        fill={`url(#${sid}-bowl)`}
        stroke={PLAN_STEEL_EDGE}
        strokeWidth="1.1"
      />
      <circle
        cx={b.x + b.w / 2}
        cy={b.y + b.h / 2}
        r={Math.max(1.5, layout.scale * 0.02)}
        fill="none"
        stroke={PLAN_STEEL_EDGE}
        strokeWidth="1"
      />
      <rect
        x={w.x}
        y={w.y}
        width={w.w}
        height={w.h}
        fill="none"
        stroke="#2f2f2f"
        strokeWidth="1.1"
        strokeDasharray="5 4"
      />
      <text
        x={w.x + Math.max(3, w.w * 0.08)}
        y={w.y + w.h - Math.max(3, w.h * 0.08)}
        fill="#2f2f2f"
        fontSize={wmLabelPx(w)}
        fontWeight="700"
        textAnchor="start"
        dominantBaseline="alphabetic"
      >
        WM
      </text>
    </g>
  );
}

function drawLaundryCanvas(ctx, room, layout, bw, stroke, innerMetres) {
  const { wm, trough, basin } = laundryFixtures(room, innerMetres);
  const ink = stroke || "#2f2f2f";
  const t = mRectToPx(trough, layout);
  const b = mRectToPx(basin, layout);
  const w = mRectToPx(wm, layout);
  ctx.save();
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = stroke || PLAN_STEEL_EDGE;
  ctx.fillStyle = canvasSilver(ctx, t.x, t.y, t.w, t.h);
  ctx.beginPath();
  ctx.rect(t.x, t.y, t.w, t.h);
  if (!bw) ctx.fill();
  ctx.stroke();
  ctx.fillStyle = canvasSilver(ctx, b.x, b.y, b.w, b.h, true);
  drawCanvasRoundRect(ctx, b.x, b.y, b.w, b.h, Math.max(2, layout.scale * 0.04));
  if (!bw) ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(b.x + b.w / 2, b.y + b.h / 2, Math.max(1.5, layout.scale * 0.02), 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = ink;
  ctx.strokeRect(w.x, w.y, w.w, w.h);
  ctx.setLineDash([]);
  ctx.fillStyle = ink;
  ctx.font = `700 ${wmLabelPx(w)}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("WM", w.x + Math.max(3, w.w * 0.08), w.y + w.h - Math.max(3, w.h * 0.08));
  ctx.restore();
}

function LaundryRoomFixtures({ room, layout, innerMetres, showHandles = false }) {
  const bench = laundryBench(room, innerMetres);
  const door = roomDoorSwing(room, innerMetres);
  if (!bench) return null;
  const r = mRectToPx(bench.rect, layout);
  const w = mRectToPx(bench.wm.rect, layout);
  const s = mRectToPx(bench.sink.rect, layout);
  const hinge = door ? mPointToPx(door.hinge, layout) : null;
  const closed = door ? mPointToPx(door.closed, layout) : null;
  const open = door ? mPointToPx(door.open, layout) : null;
  const doorLabel = door ? mPointToPx(door.doorLabel, layout) : null;
  const doorGrab = door ? mPointToPx(door.doorGrab, layout) : null;
  const doorOptions = door ? doorOptionsHandlePx(door, layout) : null;
  const hs = fixtureGrabPx(layout);
  const radius = door ? Math.max(1, door.doorWidth * layout.scale) : 0;
  const color = PLAN_WOOD_EDGE;
  return (
    <g>
      <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="#ffffff" stroke={PLAN_CERAMIC_EDGE} strokeWidth="1.2" />
      <rect
        x={s.x}
        y={s.y}
        width={s.w}
        height={s.h}
        fill="#ffffff"
        stroke={PLAN_CERAMIC_EDGE}
        strokeWidth="1.1"
      />
      <circle
        cx={s.x + s.w / 2}
        cy={s.y + s.h / 2}
        r={Math.max(1.5, Math.min(s.w, s.h) * 0.08)}
        fill="none"
        stroke={PLAN_CERAMIC_EDGE}
        strokeWidth="1"
      />
      <rect
        x={w.x}
        y={w.y}
        width={w.w}
        height={w.h}
        fill="none"
        stroke="#2f2f2f"
        strokeWidth="1.1"
        strokeDasharray="5 4"
      />
      <text
        x={w.x + Math.max(3, w.w * 0.08)}
        y={w.y + w.h - Math.max(3, w.h * 0.08)}
        fill="#2f2f2f"
        fontSize={wmLabelPx(w)}
        fontWeight="700"
        textAnchor="start"
        dominantBaseline="alphabetic"
        style={{ pointerEvents: "none" }}
      >
        WM
      </text>
      {door?.sliding ? null : (
        <PlanDoorSwing hinge={hinge} closed={closed} open={open} radius={radius} cw={door?.cw} layout={layout} />
      )}
      {door && doorLabel ? (
        <text
          x={doorLabel.x}
          y={doorLabel.y}
          fill={color}
          fontSize="11"
          fontWeight="700"
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ pointerEvents: "none" }}
        >
          {formatPlanMm(door.doorWidth)}
        </text>
      ) : null}
      {showHandles ? (
        <>
          <GrabSquare cx={w.x + w.w / 2} cy={w.y + w.h / 2} size={hs} color="#2f2f2f" />
          <GrabSquare cx={s.x + s.w / 2} cy={s.y + s.h / 2} size={hs} color={PLAN_CERAMIC_EDGE} />
          <GrabSquare cx={r.x + r.w / 2} cy={r.y + r.h / 2} size={hs} color={PLAN_CERAMIC_EDGE} />
          {doorGrab ? <GrabSquare cx={doorGrab.x} cy={doorGrab.y} size={hs} color={color} /> : null}
          {doorOptions ? (
            <OptionsHandle cx={doorOptions.cx} cy={doorOptions.cy} size={doorOptions.size} color={color} />
          ) : null}
          {!door?.sliding && open ? <MirrorHandle cx={open.x} cy={open.y} size={hs} color={color} /> : null}
        </>
      ) : null}
    </g>
  );
}

function drawLaundryRoomCanvas(ctx, room, layout, bw, stroke, innerMetres) {
  const bench = laundryBench(room, innerMetres);
  if (!bench) return;
  const ink = stroke || "#2f2f2f";
  const r = mRectToPx(bench.rect, layout);
  const s = mRectToPx(bench.sink.rect, layout);
  const w = mRectToPx(bench.wm.rect, layout);
  ctx.save();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = stroke || PLAN_CERAMIC_EDGE;
  ctx.fillStyle = bw ? "transparent" : "#ffffff";
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  if (!bw) ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.rect(s.x, s.y, s.w, s.h);
  if (!bw) ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(s.x + s.w / 2, s.y + s.h / 2, Math.max(1.5, Math.min(s.w, s.h) * 0.08), 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = ink;
  ctx.strokeRect(w.x, w.y, w.w, w.h);
  ctx.setLineDash([]);
  ctx.fillStyle = ink;
  ctx.font = `700 ${wmLabelPx(w)}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("WM", w.x + Math.max(3, w.w * 0.08), w.y + w.h - Math.max(3, w.h * 0.08));
  ctx.restore();
  const door = roomDoorSwing(room, innerMetres);
  if (door && !door.sliding) {
    if (bw) drawDoorSwingCanvas(ctx, door, layout, "#111");
    else drawPlanDoorSwingCanvas(ctx, door, layout);
  }
}

/** Custom-bench drawing feedback: a 600 stub off the wall, then the bench outline while dragging. */
function BenchDrawPreview({ preview, layout }) {
  if (preview.poly?.length) {
    const pts = preview.poly.map((p) => mPointToPx(p, layout));
    return (
      <polygon
        points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
        fill={PLAN_WOOD}
        fillOpacity="0.85"
        stroke={PLAN_WOOD_EDGE}
        strokeWidth="1.5"
        strokeLinejoin="round"
        pointerEvents="none"
      />
    );
  }
  if (!preview.stub) return null;
  const { point, normal } = preview.stub;
  const a = mPointToPx(point, layout);
  const b = mPointToPx(
    { x: point.x + normal.x * KITCHEN_BENCH_M, y: point.y + normal.y * KITCHEN_BENCH_M },
    layout
  );
  return (
    <g pointerEvents="none">
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={PLAN_WOOD_EDGE} strokeWidth="3" strokeLinecap="round" />
      <circle cx={a.x} cy={a.y} r="3.5" fill={PLAN_WOOD_EDGE} />
    </g>
  );
}

function KitchenFixtures({ room, layout, showHandles = false }) {
  const {
    benchPolys,
    benchHoles,
    overhangSegs,
    cook,
    pantry,
    fridge,
    sinkLocal,
    runHandles,
    cookGrab,
    sinkGrab,
    pantryGrab,
    fridgeGrab,
    hasAppliances,
  } = kitchenFixtureRects(room);
  const c = mRectToPx(cook, layout);
  const ptry = mRectToPx(pantry, layout);
  const frg = mRectToPx(fridge, layout);
  const hs = fixtureGrabPx(layout);
  const cookPx = cookGrab ? mPointToPx(cookGrab, layout) : null;
  const sinkPx = sinkGrab ? mPointToPx(sinkGrab, layout) : null;
  const pantryPx = pantryGrab ? mPointToPx(pantryGrab, layout) : null;
  const mirrorPx = showHandles ? sinkMirrorHandlePx(room, layout) : null;
  const fridgePx = fridgeGrab ? mPointToPx(fridgeGrab, layout) : null;
  const polyToD = (poly) => {
    const pts = poly.map((p) => mPointToPx(p, layout));
    if (!pts.length) return "";
    return `${pts.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ")} Z`;
  };
  const holePath = benchHoles?.length
    ? `${polyToD(benchPolys[0])} ${benchHoles.map(polyToD).join(" ")}`
    : "";
  return (
    <g>
      {holePath ? (
        <>
          <path
            d={holePath}
            fill={PLAN_WOOD}
            fillRule="evenodd"
            stroke={PLAN_WOOD_EDGE}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          {benchPolys.slice(1).map((poly, i) => {
            const pts = poly.map((p) => mPointToPx(p, layout));
            return (
              <polygon
                key={`bench-extra-${i}`}
                points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                fill={PLAN_WOOD}
                stroke={PLAN_WOOD_EDGE}
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            );
          })}
        </>
      ) : (
        benchPolys.map((poly, i) => {
          const pts = poly.map((p) => mPointToPx(p, layout));
          return (
            <polygon
              key={`bench-${i}`}
              points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
              fill={PLAN_WOOD}
              stroke={PLAN_WOOD_EDGE}
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          );
        })
      )}
      {overhangSegs.map((seg, i) => {
        const a = mPointToPx(seg[0], layout);
        const b = mPointToPx(seg[1], layout);
        return (
          <line
            key={`overhang-${i}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={PLAN_WOOD_EDGE}
            strokeWidth="1.15"
            strokeDasharray="5 4"
            strokeLinecap="round"
          />
        );
      })}
      {hasAppliances ? (
        <>
          <rect
            x={c.x}
            y={c.y}
            width={c.w}
            height={c.h}
            rx={Math.max(2, layout.scale * 0.04)}
            fill={PLAN_COOK}
            stroke="#2f2f2f"
            strokeWidth="1"
          />
          {[0.3, 0.7].flatMap((fx) =>
            [0.3, 0.7].map((fy) => (
              <circle
                key={`${fx}-${fy}`}
                cx={c.x + c.w * fx}
                cy={c.y + c.h * fy}
                r={Math.max(2, Math.min(c.w, c.h) * 0.14)}
                fill="none"
                stroke="#2a2a2a"
                strokeWidth="1"
              />
            ))
          )}
          <KitchenSink room={room} layout={layout} sinkLocal={sinkLocal} />
          <rect
            x={ptry.x}
            y={ptry.y}
            width={ptry.w}
            height={ptry.h}
            fill="#ffffff"
            stroke="#2f2f2f"
            strokeWidth="1.1"
          />
          <text
            x={ptry.x + Math.max(3, ptry.w * 0.08)}
            y={ptry.y + ptry.h - Math.max(3, ptry.h * 0.08)}
            fill="#2f2f2f"
            fontSize={Math.max(9, Math.min(ptry.w, ptry.h) * 0.28)}
            fontWeight="700"
            textAnchor="start"
            dominantBaseline="alphabetic"
            style={{ pointerEvents: "none" }}
          >
            P
          </text>
          <rect
            x={frg.x}
            y={frg.y}
            width={frg.w}
            height={frg.h}
            fill="#ffffff"
            stroke="#2f2f2f"
            strokeWidth="1.1"
          />
          <text
            x={frg.x + Math.max(3, frg.w * 0.08)}
            y={frg.y + frg.h - Math.max(3, frg.h * 0.08)}
            fill="#2f2f2f"
            fontSize={Math.max(9, Math.min(frg.w, frg.h) * 0.22)}
            fontWeight="700"
            textAnchor="start"
            dominantBaseline="alphabetic"
            style={{ pointerEvents: "none" }}
          >
            F
          </text>
          {showHandles ? (
            <>
              <GrabSquare cx={cookPx?.x} cy={cookPx?.y} size={hs} color="#2f2f2f" />
              <GrabSquare cx={sinkPx?.x} cy={sinkPx?.y} size={hs} color={PLAN_STEEL_EDGE} />
              <GrabSquare cx={pantryPx?.x} cy={pantryPx?.y} size={hs} color="#2f2f2f" />
              <GrabSquare cx={fridgePx?.x} cy={fridgePx?.y} size={hs} color="#2f2f2f" />
              {mirrorPx ? (
                <OptionsHandle cx={mirrorPx.cx} cy={mirrorPx.cy} size={mirrorPx.size} color={PLAN_STEEL_EDGE} />
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
      {(showHandles ? runHandles || [] : []).map((h) => {
        const p = mPointToPx(rotatedLocalPoint(room, h), layout);
        return (
          <AxisHandle
            key={`run-${h.which}`}
            cx={p.x}
            cy={p.y}
            size={hs}
            color={PLAN_WOOD_EDGE}
            axis={kitchenRunResizeKind(room)}
          />
        );
      })}
    </g>
  );
}

function porchBoardNodes(part, layout, keyPrefix) {
  const boardM = 0.09;
  const gapM = 0.008;
  const inset = 1.5 / layout.scale;
  const inner = {
    x: part.x + inset,
    y: part.y + inset,
    w: Math.max(0.05, part.w - inset * 2),
    h: Math.max(0.05, part.h - inset * 2),
  };
  const longIsX = part.w >= part.h;
  const span = longIsX ? inner.h : inner.w;
  const n = Math.max(2, Math.round((span + gapM) / (boardM + gapM)));
  const board = (span - (n - 1) * gapM) / n;
  const nodes = [];
  for (let i = 0; i < n; i += 1) {
    const off = i * (board + gapM);
    const rect = longIsX
      ? { x: inner.x, y: inner.y + off, w: inner.w, h: board }
      : { x: inner.x + off, y: inner.y, w: board, h: inner.h };
    const p = mRectToPx(rect, layout);
    nodes.push(
      <g key={`${keyPrefix}-board-${i}`}>
        <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={DECK_STAINS[i % DECK_STAINS.length]} />
        {longIsX ? (
          <line x1={p.x} y1={p.y + p.h} x2={p.x + p.w} y2={p.y + p.h} stroke={DECK_EDGE} strokeWidth="1" />
        ) : (
          <line x1={p.x + p.w} y1={p.y} x2={p.x + p.w} y2={p.y + p.h} stroke={DECK_EDGE} strokeWidth="1" />
        )}
      </g>
    );
  }
  return nodes;
}

function PorchDecking({ room, layout, metres, showHandles = false }) {
  const door = porchFrontDoor(room, metres);
  const parts = porchFootprints(room);
  const steps = porchStepFlight(room, metres);
  const handles = showHandles ? porchResizeHandles(room, metres) : [];
  const options = showHandles ? porchStepOptionsPx(room, layout, metres) : null;
  const hs = fixtureGrabPx(layout);
  return (
    <g>
      {parts.map((part, i) => {
        const r = roomToPx(part, layout);
        const clipId = `qc-porch-clip-${room.id}-${i}`;
        return (
          <g key={`porch-part-${i}`}>
            <defs>
              <clipPath id={clipId}>
                <rect x={r.x} y={r.y} width={r.w} height={r.h} />
              </clipPath>
            </defs>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={ROOM_PORCH_FILL} />
            <g clipPath={`url(#${clipId})`}>{porchBoardNodes(part, layout, `${room.id}-${i}`)}</g>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke={ROOM_PORCH} strokeWidth={PLAN_LINE} />
          </g>
        );
      })}
      {door ? (
        <>
          <FrontDoorOpening door={door} layout={layout} />
          <DoorSwingMarks door={door} layout={layout} color={MONUMENT} showGrab={showHandles} />
        </>
      ) : null}
      {steps.map((step) => {
        const p = mRectToPx(step, layout);
        return (
          <rect
            key={`porch-step-${step.i}`}
            x={p.x}
            y={p.y}
            width={p.w}
            height={p.h}
            fill={DECK_STAINS[(step.i + 1) % DECK_STAINS.length]}
            stroke={DECK_EDGE}
            strokeWidth="1"
          />
        );
      })}
      {handles.map((h) => {
        const p = mPointToPx(h.point, layout);
        return <AxisHandle key={h.which} cx={p.x} cy={p.y} size={hs} color={ROOM_PORCH} axis={h.axis} />;
      })}
      {options ? <OptionsHandle cx={options.cx} cy={options.cy} size={options.size} color={ROOM_PORCH} /> : null}
    </g>
  );
}

function FrontDoorOpening({ door, layout }) {
  const opening = porchFrontDoorOpening(door);
  if (!opening) return null;
  const pts = opening.pts.map((p) => mPointToPx(p, layout));
  const points = pts.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <g>
      <polygon points={points} fill="#ffffff" />
      <polygon points={points} fill={LIVING_FILL} />
      {opening.jambs.map((jamb, i) => {
        const a = mPointToPx(jamb[0], layout);
        const b = mPointToPx(jamb[1], layout);
        return (
          <line
            key={`jamb-${i}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={MONUMENT}
            strokeWidth={PLAN_LINE}
            strokeLinecap="butt"
          />
        );
      })}
    </g>
  );
}

function DoorSwingMarks({ door, layout, color, showGrab = false }) {
  if (!door) return null;
  const hinge = mPointToPx(door.hinge, layout);
  const closed = mPointToPx(door.closed, layout);
  const open = mPointToPx(door.open, layout);
  const doorLabel = mPointToPx(door.doorLabel, layout);
  const doorGrab = mPointToPx(door.doorGrab, layout);
  const radius = Math.max(1, door.doorWidth * layout.scale);
  const sweep = door.cw ? 1 : 0;
  const hs = fixtureGrabPx(layout);
  return (
    <g>
      <line
        x1={hinge.x}
        y1={hinge.y}
        x2={open.x}
        y2={open.y}
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d={`M ${closed.x} ${closed.y} A ${radius} ${radius} 0 0 ${sweep} ${open.x} ${open.y}`}
        fill="none"
        stroke={color}
        strokeWidth="1.2"
      />
      <text
        x={doorLabel.x}
        y={doorLabel.y}
        fill={color}
        stroke={WHITE}
        strokeWidth="3"
        paintOrder="stroke fill"
        fontSize="11"
        fontWeight="700"
        textAnchor="middle"
        dominantBaseline="middle"
        style={{ pointerEvents: "none" }}
      >
        {formatPlanMm(door.doorWidth)}
      </text>
      {showGrab ? (
        <>
          <GrabSquare cx={doorGrab.x} cy={doorGrab.y} size={hs} color={color} />
          <MirrorHandle cx={open.x} cy={open.y} size={hs} color={color} />
        </>
      ) : null}
    </g>
  );
}

/** Room edge under the cursor that may be dragged to resize (fixed-size sides excluded). */
function roomResizeEdgeHit(room, verts, raw) {
  if (hasCustomBench(room)) return null;
  const edge = hitTestEdge(verts, raw, true);
  if (edge && isLaundry(room) && !laundrySideResizable(room, roomSideFromEdge(edge.index))) return null;
  return edge;
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
  if (
    p.x >= r.x + r.w - pad - size &&
    p.x <= r.x + r.w - pad &&
    p.y >= r.y + r.h - pad - size &&
    p.y <= r.y + r.h - pad
  ) {
    return "delete";
  }
  return null;
}

function DeleteHandle({ cx, cy, size, color = "#b3261e" }) {
  if (cx == null || cy == null) return null;
  const s = size;
  return (
    <g transform={`translate(${cx}, ${cy})`}>
      <circle r={s / 2 + 1} fill={WHITE} stroke={color} strokeWidth="1.5" />
      <line x1={-s * 0.26} y1={-s * 0.2} x2={s * 0.26} y2={-s * 0.2} stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1={-s * 0.08} y1={-s * 0.28} x2={s * 0.08} y2={-s * 0.28} stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <path
        d={`M ${-s * 0.19} ${-s * 0.14} L ${-s * 0.15} ${s * 0.3} L ${s * 0.15} ${s * 0.3} L ${s * 0.19} ${-s * 0.14}`}
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </g>
  );
}

function hitKitchenLayoutHandle(r, p, size) {
  const pad = 2;
  return (
    p.x >= r.x + pad &&
    p.x <= r.x + pad + size &&
    p.y >= r.y + r.h - pad - size &&
    p.y <= r.y + r.h - pad
  );
}

/** Options icon spot on the sink (middle of the drainer end); clicking it mirrors the sink. */
function sinkMirrorHandlePx(room, layout) {
  const { sinkLocal, hasAppliances } = kitchenFixtureRects(room);
  if (!hasAppliances || !sinkLocal?.origin) return null;
  const m = sinkMirrored(room) ? 1 : 0;
  const local = {
    x: sinkLocal.origin.x + sinkLocal.along.x * m + sinkLocal.across.x / 2,
    y: sinkLocal.origin.y + sinkLocal.along.y * m + sinkLocal.across.y / 2,
  };
  const p = mPointToPx(rotatedLocalPoint(room, local), layout);
  return { cx: p.x, cy: p.y, size: fixtureGrabPx(layout) };
}

function hitSinkMirrorHandle(room, layout, raw) {
  if (roomKind(room) !== "kitchen") return false;
  const h = sinkMirrorHandlePx(room, layout);
  if (!h) return false;
  return Math.hypot(raw.x - h.cx, raw.y - h.cy) <= h.size / 2 + 3;
}

function hitKitchenRunHandle(room, layout, raw) {
  const { runHandles } = kitchenFixtureRects(room);
  const hs = fixtureGrabPx(layout);
  const hitR = hs / 2 + 5;
  let best = null;
  for (const h of runHandles || []) {
    const px = mPointToPx(rotatedLocalPoint(room, h), layout);
    const d = Math.hypot(raw.x - px.x, raw.y - px.y);
    if (d <= hitR && (!best || d < best.d)) best = { which: h.which, d };
  }
  if (!best) return null;
  return {
    type: "kitchen-run",
    kind: kitchenRunResizeKind(room),
    which: best.which,
  };
}

function pointInPxRect(r, p) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
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
  frame: frameProp,
  rooms,
  onRoomsChange,
  nextIdRef,
  onBuildingChange,
  viewScale: _viewScale = null,
  onViewScaleChange,
  maxArea = true,
  onMaxAreaChange,
  address = "",
  quoteEmail = "",
  quoteFirstName = "",
  onClose,
}) {
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const roomsRef = useRef(rooms);
  const layoutRef = useRef(null);
  const frameRef = useRef(null);
  const freezeLayoutRef = useRef(null);
  if (!frameRef.current && vertices.length >= 3) {
    frameRef.current = frameProp || liveDesignFrame(vertices, ppm, null);
  }
  const [buildingMetres, setBuildingMetres] = useState(() =>
    (frameRef.current?.metres || []).map(snapPointToGrid)
  );
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState(null);
  const [buildingSnap, setBuildingSnap] = useState(true);
  const [threeDOpen, setThreeDOpen] = useState(false);
  const [clientSendOpen, setClientSendOpen] = useState(false);
  const [walkSetup, setWalkSetup] = useState(false);
  const [walkStart, setWalkStart] = useState(null);
  const [walkFinish, setWalkFinish] = useState(null);
  const [walkStops, setWalkStops] = useState([]);
  const walkSetupRef = useRef(false);
  const walkMarkersRef = useRef(null);
  walkSetupRef.current = walkSetup;
  const [showDimensions, setShowDimensions] = useState(false);
  const [viewMode, setViewMode] = useState(false);
  const [pdfCaptureOn, setPdfCaptureOn] = useState(false);
  const [pdfPreview, setPdfPreview] = useState(null);
  const [planQuarter, setPlanQuarter] = useState(0);
  const [viewQuarter, setViewQuarter] = useState(0);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const pdfCaptureRef = useRef(null);
  /** Custom-bench drawing preview (world metres): a 600 stub on hover/press, then the bench outline. */
  const [benchPreview, setBenchPreview] = useState(null);
  const [, setViewTick] = useState(0);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [areaOffsetM, setAreaOffsetM] = useState({ dx: 0, dy: 0 });
  const [eaveDepths, setEaveDepths] = useState([]);
  const eaveDepthsRef = useRef(eaveDepths);
  eaveDepthsRef.current = eaveDepths;
  const areaDragRef = useRef(null);
  const buildingMetresRef = useRef(buildingMetres);
  roomsRef.current = rooms;
  buildingMetresRef.current = buildingMetres;
  const maxAreaM2 = maxArea ? MAX_AREA_M2 : 0;

  const openPdfPreview = useCallback(() => {
    if (!layoutRef.current || pdfCaptureOn || pdfPreview) return;
    setPlanQuarter(0);
    setViewQuarter(0);
    setPdfPreview({ status: "loading", plan: null, view: null, error: "" });
    setPdfCaptureOn(true);
  }, [pdfCaptureOn, pdfPreview]);

  const closePdfPreview = useCallback(() => {
    if (pdfGenerating) return;
    setPdfPreview(null);
    setPdfCaptureOn(false);
  }, [pdfGenerating]);

  useEffect(() => {
    if (!pdfCaptureOn || pdfPreview?.status !== "loading") return undefined;
    let cancelled = false;
    (async () => {
      try {
        const current = layoutRef.current;
        if (!current) throw new Error("No design to save");
        const capture3d = await waitForDesignCapture(pdfCaptureRef);
        if (cancelled) return;
        const spec = designSheetSpec();
        const view3dUrl = capture3d(2400, { defaultView: true, aspect: spec.innerAspect });
        if (cancelled || !view3dUrl) throw new Error("3D view was not ready");
        const planCanvas = cropWhiteCanvas(
          buildDesignExportCanvas(current, roomsRef.current, {
            mode: "color",
            dimensions: true,
            scale: 3,
            showAreaLabel: false,
            grid: false,
          })
        );
        const [plan, view] = await Promise.all([
          measureDataUrl(planCanvas.toDataURL("image/png")),
          measureDataUrl(view3dUrl),
        ]);
        if (cancelled) return;
        setPdfPreview({ status: "ready", plan, view, error: "" });
      } catch (err) {
        if (!cancelled) {
          console.error("[QuickConcept] design PDF preview failed:", err);
          setPdfPreview({
            status: "error",
            plan: null,
            view: null,
            error: err?.message || "Could not prepare the preview.",
          });
        }
      } finally {
        if (!cancelled) setPdfCaptureOn(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfCaptureOn, pdfPreview?.status]);

  const generatePdfFromPreview = useCallback(async () => {
    const current = layoutRef.current;
    if (!current || pdfPreview?.status !== "ready" || pdfGenerating) return;
    const filename = designPdfFilename(current.areaM2);
    let handle = null;
    if (typeof window.showSaveFilePicker === "function") {
      try {
        handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: "PDF document",
              accept: { "application/pdf": [".pdf"] },
            },
          ],
        });
      } catch (err) {
        if (err && (err.name === "AbortError" || err.name === "NotAllowedError")) return;
        console.warn("showSaveFilePicker failed, falling back to download:", err);
        handle = null;
      }
    }
    setPdfGenerating(true);
    try {
      const [planUrl, viewUrl] = await Promise.all([
        rotatePngDataUrl(pdfPreview.plan.url, planQuarter),
        rotatePngDataUrl(pdfPreview.view.url, viewQuarter),
      ]);
      const pdf = await buildSheetPdf(planUrl, viewUrl, {
        areaM2: current.areaM2,
        rooms: roomsRef.current,
      });
      const blob = pdf.output("blob");
      if (handle) {
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      setPdfPreview(null);
    } catch (err) {
      console.error("[QuickConcept] design PDF failed:", err);
      window.alert(err?.message || "Could not save the PDF.");
    } finally {
      setPdfGenerating(false);
    }
  }, [pdfGenerating, pdfPreview, planQuarter, viewQuarter]);

  const applyBuildingMetres = useCallback(
    (unsnapped) => {
      const nextMetres = unsnapped.map(snapPointToGrid);
      buildingMetresRef.current = nextMetres;
      setBuildingMetres(nextMetres);
      if (onBuildingChange) onBuildingChange(nextMetres);
    },
    [onBuildingChange]
  );

  useEffect(() => {
    const metres = frameRef.current?.metres || [];
    if (onBuildingChange && metres.some((p) => snapMetresToStep(p.x) !== p.x || snapMetresToStep(p.y) !== p.y)) {
      onBuildingChange(metres.map(snapPointToGrid));
    }
    const tidy = (list) => {
      let out = list.map(normaliseRoomToGrid);
      const metresNow = buildingMetresRef.current;
      const inner = metresNow?.length ? insetPolygon(metresNow, WALL_THICKNESS_M) : null;
      out = out.map((r, i) => {
        const merged = mergeRoomWalls(r, wallCentreLines(metresNow, out, r.id, inner));
        out[i] = merged;
        return merged;
      });
      return out;
    };
    if (JSON.stringify(tidy(roomsRef.current)) !== JSON.stringify(roomsRef.current)) {
      onRoomsChange((prev) => tidy(prev));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const el = stageRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      const current = layoutRef.current;
      if (!current || dragRef.current) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const deltaPx = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * rect.height : e.deltaY;
      const scale = Math.min(
        VIEW_SCALE_MAX,
        Math.max(VIEW_SCALE_MIN, current.scale * Math.exp(-deltaPx * 0.0015))
      );
      if (Math.abs(scale - current.scale) < 1e-6) return;
      const k = scale / current.scale;
      freezeLayoutRef.current = {
        scale,
        originX: px - (px - current.originX) * k,
        originY: py - (py - current.originY) * k,
        offsetX: px - (px - current.offsetX) * k,
        offsetY: py - (py - current.offsetY) * k,
      };
      setViewTick((t) => t + 1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (threeDOpen || deleteTargetId || clearOpen || pdfPreview || clientSendOpen) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, threeDOpen, deleteTargetId, clearOpen, pdfPreview, clientSendOpen]);

  const addWalkStop = useCallback(
    (kind) => {
      const inner =
        buildingMetres.length >= 3 ? insetPolygon(buildingMetres, WALL_THICKNESS_M) : buildingMetres;
      const start =
        walkMarkersRef.current?.start ||
        walkStart ||
        defaultWalkStartMetres(rooms, buildingMetres, inner);
      const frame = walkDoorFrame(rooms, buildingMetres, inner);
      const stops = walkMarkersRef.current?.stops || walkStops;
      const point = nextWalkLocationMetres(start, stops, frame);
      if (!point) return;
      setWalkStops((list) => [...list, { kind, x: point.x, y: point.y }]);
      setWalkSetup(true);
      freezeLayoutRef.current = null;
    },
    [buildingMetres, rooms, walkStops, walkStart]
  );
  const addWalkLocation = useCallback(() => addWalkStop("location"), [addWalkStop]);
  const addWalkPoint = useCallback(() => addWalkStop("point"), [addWalkStop]);
  const clearWalkSetup = useCallback(() => {
    setWalkStart(null);
    setWalkFinish(null);
    setWalkStops([]);
    freezeLayoutRef.current = null;
  }, []);

  const addWalkFinish = useCallback(() => {
    if (walkFinish || walkMarkersRef.current?.finish) return;
    const inner =
      buildingMetres.length >= 3 ? insetPolygon(buildingMetres, WALL_THICKNESS_M) : buildingMetres;
    const start =
      walkMarkersRef.current?.start ||
      walkStart ||
      defaultWalkStartMetres(rooms, buildingMetres, inner);
    const point = defaultWalkFinishMetres(rooms, buildingMetres, inner, start);
    if (!point) return;
    setWalkFinish(point);
    setWalkSetup(true);
    freezeLayoutRef.current = null;
  }, [buildingMetres, rooms, walkFinish, walkStart]);

  const shownWalkStart =
    buildingMetres.length >= 3
      ? walkStart ||
        defaultWalkStartMetres(
          rooms,
          buildingMetres,
          insetPolygon(buildingMetres, WALL_THICKNESS_M)
        )
      : null;
  const walkFitPoints =
    walkSetup && shownWalkStart
      ? [shownWalkStart, ...walkStops, ...(walkFinish ? [walkFinish] : [])]
      : null;
  const eaveDepthsLive = normalizeEaveDepths(eaveDepths, buildingMetres.length);
  const eaveRunList = buildingMetres.length >= 3 ? eaveRuns(buildingMetres, eaveDepthsLive) : [];
  const eaveFitPoints = eaveRunList.flatMap((run) => [run.a, run.b]);
  const layout = (() => {
    if (!(size.w > 0 && size.h > 0 && buildingMetres.length >= 3)) return null;
    const live = showDimensions
      ? layoutFitWithDims(buildingMetres, rooms, size.w, size.h, walkFitPoints, eaveFitPoints)
      : layoutFromMetres(buildingMetres, size.w, size.h, null, walkFitPoints, eaveFitPoints);
    live.eaveDepths = eaveDepthsLive;
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
  useEffect(() => {
    const s = freezeLayoutRef.current?.scale;
    if (s > 0) onViewScaleChange?.(s);
  }, [layout, onViewScaleChange]);
  const innerMetres = layout ? insetPolygon(layout.metres, WALL_THICKNESS_M) : null;
  walkMarkersRef.current =
    walkSetup && layout && shownWalkStart
      ? { start: shownWalkStart, finish: walkFinish, stops: walkStops }
      : null;
  const innerPts =
    layout && innerMetres
      ? innerMetres.map((p) => ({
          x: p.x * layout.scale + layout.originX,
          y: p.y * layout.scale + layout.originY,
        }))
      : null;
  const footprintM = layout ? planFootprintBounds(layout.metres, rooms) : null;
  const buildingSideLabels = layout
    ? sideLengthLabels(layout.pts, true, layout.scale, {
        clearPx: DIM_CLEAR_M * layout.scale,
        footprintPx: footprintM
          ? {
              minX: footprintM.minX * layout.scale + layout.originX,
              minY: footprintM.minY * layout.scale + layout.originY,
              maxX: footprintM.maxX * layout.scale + layout.originX,
              maxY: footprintM.maxY * layout.scale + layout.originY,
            }
          : null,
      })
    : [];
  const livingPt = innerMetres
    ? livingLabelPoint(innerMetres, walledRooms(rooms))
    : layout
      ? livingLabelPoint(layout.metres, walledRooms(rooms))
      : null;
  const livingDims = innerMetres
    ? livingApproxDims(innerMetres, walledRooms(rooms))
    : layout
      ? livingApproxDims(layout.metres, walledRooms(rooms))
      : null;
  const partitionWalls = layout
    ? bedroomBathroomInternalWalls(rooms, innerMetres || layout.metres)
    : [];
  const areaAnchorM = layout ? areaLabelAnchorM(layout.metres, rooms) : null;
  const designHandles = layout && !viewMode ? designHandlesPx(layout, rooms) : null;
  const partitionWallsPx = partitionWalls.map((seg) => wallSegToLayoutPx(seg, layout));
  const partitionWallCornersPx = layout
    ? partitionWallCorners(partitionWalls).map((c) => wallCornerToLayoutPx(c, layout))
    : [];

  const renderPlanRoom = (room) => {
    const r = roomToPx(room, layout);
    const edit = !viewMode;
    const active = edit && hover?.id === room.id;
    const colors = roomColors(room);
    const kind = roomKind(room);
    const hideExtent = kind === "kitchen" || kind === "porch" || (viewMode && kind === "living");
    return (
      <g key={room.id}>
        <rect
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          fill={kind === "living" || kind === "porch" || hasCustomBench(room) ? "none" : roomFloorFill(kind, "qc-floor", colors)}
          stroke={hideExtent ? "none" : active || kind === "living" ? colors.stroke : "#c4b8a8"}
          strokeWidth={active ? PLAN_LINE_ACTIVE : PLAN_LINE}
        />
        {kind === "bedroom" ? (
          <rect
            x={r.x + 1}
            y={r.y + 1}
            width={Math.max(0, r.w - 2)}
            height={Math.max(0, r.h - 2)}
            fill={CARPET_BASE}
            filter="url(#qc-floor-carpet-n)"
            opacity="0.42"
            pointerEvents="none"
          />
        ) : null}
        {kind === "bathroom" || kind === "powder" ? (
          <BathroomFixtures room={room} layout={layout} innerMetres={innerMetres} walls={partitionWalls} showHandles={edit} />
        ) : kind === "kitchen" ? (
          <KitchenFixtures room={room} layout={layout} showHandles={edit} />
        ) : kind === "laundry" ? (
          <LaundryFixtures room={room} layout={layout} innerMetres={innerMetres} />
        ) : kind === "laundryRoom" ? (
          <LaundryRoomFixtures room={room} layout={layout} innerMetres={innerMetres} showHandles={edit} />
        ) : kind === "living" ? (
          <LivingSetFixtures room={room} layout={layout} showHandles={edit} />
        ) : kind === "porch" ? (
          <PorchDecking room={room} layout={layout} metres={layout.metres} showHandles={edit} />
        ) : (
          <BedroomFixtures room={room} layout={layout} innerMetres={innerMetres} showHandles={edit} />
        )}
        {kind === "living" ? renderRoomHandles(room) : null}
      </g>
    );
  };

  /** Drag / rotate / options / delete icons; drawn above partition walls so small rooms keep them visible. */
  const renderRoomHandles = (room) => {
    if (viewMode) return null;
    const host = isPorch(room) ? porchHostRect(room, layout.metres) : room;
    const r = roomToPx(host, layout);
    const hs = handlePx(layout);
    const pad = 2;
    const colors = roomColors(room);
    const kind = roomKind(room);
    return (
      <g key={`handles-${room.id}`}>
        <rect
          x={r.x + pad}
          y={r.y + pad}
          width={hs}
          height={hs}
          fill={colors.stroke}
          stroke={WHITE}
          strokeWidth="1"
        />
        <g transform={`translate(${r.x + r.w - pad - hs / 2}, ${r.y + pad + hs / 2})`}>
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
        {kind === "kitchen" ? (
          <OptionsHandle
            cx={r.x + pad + hs / 2}
            cy={r.y + r.h - pad - hs / 2}
            size={hs}
            color={colors.stroke}
          />
        ) : null}
        <DeleteHandle cx={r.x + r.w - pad - hs / 2} cy={r.y + r.h - pad - hs / 2} size={hs} />
      </g>
    );
  };

  const addRoom = useCallback(
    (kind, w, h) => {
      const current = layoutRef.current;
      if (!current) return;
      nextIdRef.current += 1;
      const id = `${kind}-${nextIdRef.current}`;
      let room;
      if (kind === "porch") {
        const placed = nextPorchPlacement(roomsRef.current, current.metres, w, h);
        room = keepPorchOutside(null, { id, kind, rot: 0, ...placed, layoutLongIsX: w >= h }, current.metres, {
          slide: true,
        });
      } else {
        const inner = insetPolygon(current.metres, WALL_THICKNESS_M) || current.metres;
        const remain = kind === "living" ? livingRemainingRect(inner, walledRooms(roomsRef.current)) : null;
        const placed = remain
          ? {
              x: snapMetresToStep(remain.x + remain.w / 2 - w / 2),
              y: snapMetresToStep(remain.y + remain.h / 2 - h / 2),
              w,
              h,
            }
          : nextRoomPlacement(roomsRef.current, inner, w, h);
        room = keepRoomInside(null, snapRoomToGrid({ id, kind, rot: 0, ...placed, layoutLongIsX: w >= h }), inner);
        if (kind === "bedroom") {
          room = {
            ...room,
            doorAlong: 0,
            robeWidth: ROBE_WIDTH_DEFAULT_M,
          };
        } else if (kind === "bathroom") {
          room = {
            ...room,
            ...defaultBathroomLayout(room.w, room.h),
          };
        } else if (kind === "powder") {
          room = {
            ...room,
            ...defaultPowderLayout(w, h),
          };
        } else if (kind === "laundryRoom") {
          room = {
            ...room,
            ...defaultLaundryLayout(room.w, room.h),
          };
        }
      }
      onRoomsChange((prev) => prev.concat(snapRoomToGrid(room)));
    },
    [nextIdRef, onRoomsChange]
  );

  const addBedroom = useCallback(() => {
    addRoom("bedroom", BEDROOM_W_M, BEDROOM_H_M);
  }, [addRoom]);

  const addBathroom = useCallback(() => {
    addRoom("bathroom", BATHROOM_W_M, BATHROOM_H_M);
  }, [addRoom]);

  const addPowder = useCallback(() => {
    addRoom("powder", POWDER_W_M, POWDER_H_M);
  }, [addRoom]);

  const addLaundry = useCallback(() => {
    addRoom("laundry", LAUNDRY_LENGTHS_M[0], LAUNDRY_DEPTH_M);
  }, [addRoom]);

  const addLaundryRoom = useCallback(() => {
    addRoom("laundryRoom", LAUNDRY_ROOM_W_M, LAUNDRY_ROOM_H_M);
  }, [addRoom]);

  const addKitchen = useCallback(() => {
    addRoom("kitchen", KITCHEN_W_M, KITCHEN_H_M);
  }, [addRoom]);

  const addPorch = useCallback(() => {
    addRoom("porch", PORCH_W_M, PORCH_H_M);
  }, [addRoom]);

  const addLivingSet = useCallback(() => {
    addRoom("living", LIVING_SET_ALONG_M, LIVING_SET_ACROSS_M);
  }, [addRoom]);

  const updateRoom = useCallback(
    (id, unsnapped) => {
      const next = snapRoomToGrid(unsnapped);
      onRoomsChange((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          if (
            !isBathLike(next) ||
            !vanityWmSide(next) ||
            !vanityWmConflicts(next, innerMetres) ||
            vanityWmConflicts(r, innerMetres)
          ) {
            return next;
          }
          const resized = next.x !== r.x || next.y !== r.y || next.w !== r.w || next.h !== r.h;
          return (resized && placeVanityWm(next, innerMetres)) || r;
        })
      );
    },
    [innerMetres, onRoomsChange]
  );

  const onStagePointerDown = useCallback(
    (e) => {
      if (e.button !== 0 || !layout) return;
      const el = stageRef.current;
      if (!el) return;
      const raw = pointFromEvent(el, e);
      const walkHit = walkSetupRef.current ? hitWalkMarker(raw, layout, walkMarkersRef.current) : null;
      if (walkHit) {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        const ownedFreeze = !freezeLayoutRef.current;
        if (ownedFreeze) {
          freezeLayoutRef.current = {
            scale: layout.scale,
            originX: layout.originX,
            originY: layout.originY,
            offsetX: layout.offsetX,
            offsetY: layout.offsetY,
          };
        }
        dragRef.current = {
          mode: "walk-marker",
          kind: walkHit.kind,
          index: walkHit.index,
          ownedFreeze,
        };
        setHover({ kind: "move", id: "walk-marker" });
        return;
      }
      if (viewMode) return;
      const hs = handlePx(layout);
      const designHit = hitDesignHandle(layout, roomsRef.current, raw);
      if (designHit) {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        freezeLayoutRef.current = {
          scale: layout.scale,
          originX: layout.originX,
          originY: layout.originY,
          offsetX: layout.offsetX,
          offsetY: layout.offsetY,
        };
        const startMetres = buildingMetres.map((p) => ({ x: p.x, y: p.y }));
        const startRooms = roomsRef.current.map((r) => ({ ...r }));
        if (designHit === "design-move") {
          dragRef.current = {
            mode: "design-move",
            grab: pxToMetres(raw, layout),
            startMetres,
            startRooms,
            dx: 0,
            dy: 0,
          };
        } else {
          const { centre } = designHandlesPx(layout, roomsRef.current);
          dragRef.current = {
            mode: "design-rotate",
            centre,
            startRaw: raw,
            startAngle: Math.atan2(raw.y - centre.y, raw.x - centre.x),
            startMetres,
            startRooms,
            turns: 0,
            moved: false,
          };
        }
        setHover(hintAt({ id: "design", kind: designHit === "design-move" ? "move" : "rotate", type: designHit }, raw));
        return;
      }
      const benchWall = armedBenchWallAt(raw, layout, innerMetres, roomsRef.current);
      if (benchWall) {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        dragRef.current = {
          mode: "kitchen-bench",
          id: benchWall.room.id,
          loop: benchWall.loop,
          anchor: benchWall.s,
          cur: benchWall.s,
          bench: null,
        };
        setBenchPreview({ stub: loopPointAt(benchWall.loop, benchWall.s) });
        return;
      }
      const stacked = roomsStackOrder(roomsRef.current);
      for (let i = stacked.length - 1; i >= 0; i -= 1) {
        const room = stacked[i];
        const r = roomToPx(room, layout);
        const handle = hitRoomHandle(r, raw, hs);
        if (handle === "delete") {
          e.preventDefault();
          setDeleteTargetId(room.id);
          setHover(null);
          return;
        }
        if (hitCouchOptions(room, layout, raw)) {
          e.preventDefault();
          updateRoom(room.id, cycleCouchType(room, innerMetres));
          setHover(hintAt({ id: room.id, kind: "rotate", type: "couch-options" }, raw));
          return;
        }
        if (roomKind(room) === "kitchen" && hitKitchenLayoutHandle(r, raw, hs)) {
          e.preventDefault();
          updateRoom(room.id, cycleKitchenLayout(room, innerMetres));
          setHover(hintAt({ id: room.id, kind: "rotate", type: "kitchen-layout" }, raw));
          return;
        }
        if (roomKind(room) === "bathroom") {
          const { shower } = bathroomFixtures(room);
          if (hitShowerRotateHandle(shower, layout, raw)) {
            e.preventDefault();
            updateRoom(room.id, rotateShower90(room));
            setHover(hintAt({ id: room.id, kind: "rotate", type: "shower-rotate" }, raw));
            return;
          }
        }
        if (handle === "rotate") {
          e.preventDefault();
          const base = isPorch(room) ? collapsePorch(room, layout.metres) : room;
          const next = mergeRoomWalls(
            snapRoomToGrid(rotateRoom90(base, innerMetres)),
            wallCentreLines(layout.metres, roomsRef.current, room.id, innerMetres)
          );
          updateRoom(
            room.id,
            isPorch(room)
              ? keepPorchOutside(base, next, layout.metres, { slide: true })
              : keepRoomInside(room, next, innerMetres)
          );
          return;
        }
        if (roomKind(room) === "kitchen") {
          if (hitSinkMirrorHandle(room, layout, raw)) {
            e.preventDefault();
            updateRoom(room.id, { ...room, sinkMirror: !sinkMirrored(room) });
            setHover(hintAt({ id: room.id, kind: "rotate", type: "sink-mirror" }, raw));
            return;
          }
          const appHit = hitKitchenApplianceHandle(room, layout, raw);
          if (appHit) {
            e.preventDefault();
            el.setPointerCapture(e.pointerId);
            const cursorM = pxToMetres(raw, layout);
            dragRef.current = {
              ...startKitchenApplianceDrag(room, appHit.type, cursorM),
              id: room.id,
              start: { ...room },
            };
            setHover(hintAt({ id: room.id, kind: "move", type: appHit.type }, raw));
            return;
          }
          const runHit = hitKitchenRunHandle(room, layout, raw);
          if (runHit) {
            e.preventDefault();
            el.setPointerCapture(e.pointerId);
            const cursorM = pxToMetres(raw, layout);
            dragRef.current = {
              ...startKitchenRunDrag(room, runHit.which, cursorM),
              id: room.id,
              start: { ...room },
            };
            setHover(hintAt({ id: room.id, kind: runHit.kind, type: "kitchen-run" }, raw));
            return;
          }
        }
        if (roomKind(room) === "bedroom" || isBathLike(room) || isLaundryRoom(room) || isPorch(room)) {
          const fixture = isPorch(room)
            ? hitPorchFixtureHandle(room, layout, raw, layout.metres)
            : roomKind(room) === "bedroom"
              ? hitBedroomFixtureHandle(room, layout, raw, innerMetres)
              : isLaundryRoom(room)
                ? hitLaundryFixtureHandle(room, layout, raw, innerMetres)
                : hitBathroomFixtureHandle(room, layout, raw, innerMetres);
          if (fixture) {
            if (fixture.type === "shower-resize") {
              e.preventDefault();
              el.setPointerCapture(e.pointerId);
              const cursorM = pxToMetres(raw, layout);
              dragRef.current = {
                ...startShowerResizeDrag(room, fixture.which, cursorM),
                id: room.id,
                start: { ...room },
              };
              setHover(hintAt({ id: room.id, kind: fixture.kind, type: "shower-resize" }, raw));
              return;
            }
            if (fixture.type === "shower-rotate") {
              e.preventDefault();
              updateRoom(room.id, rotateShower90(room));
              setHover(hintAt({ id: room.id, kind: "rotate", type: "shower-rotate" }, raw));
              return;
            }
            if (fixture.type === "vanity-options") {
              e.preventDefault();
              const nextRoom = cycleVanityWm(room, innerMetres);
              updateRoom(room.id, nextRoom);
              const noFit = !vanityWmSide(room) && !vanityWmSide(nextRoom);
              setHover(
                hintAt({ id: room.id, kind: "rotate", type: noFit ? "vanity-options-full" : "vanity-options" }, raw)
              );
              return;
            }
            if (fixture.type === "door-options") {
              e.preventDefault();
              updateRoom(room.id, cycleRoomDoorStyle(room, innerMetres));
              setHover(hintAt({ id: room.id, kind: "rotate", type: "door-options" }, raw));
              return;
            }
            if (fixture.type === "door-flip") {
              e.preventDefault();
              updateRoom(room.id, flipRoomDoor(room));
              setHover(hintAt({ id: room.id, kind: "rotate", type: "door-flip" }, raw));
              return;
            }
            if (fixture.type === "robe-resize") {
              e.preventDefault();
              el.setPointerCapture(e.pointerId);
              const cursorM = pxToMetres(raw, layout);
              dragRef.current = {
                ...startRobeResizeDrag(room, fixture.which, cursorM, innerMetres),
                id: room.id,
                start: { ...room },
              };
              setHover(hintAt({ id: room.id, kind: fixture.kind, type: "robe-resize" }, raw));
              return;
            }
            if (fixture.type === "porch-options") {
              e.preventDefault();
              updateRoom(room.id, cyclePorchSteps(room));
              setHover(hintAt({ id: room.id, kind: "rotate", type: "porch-options" }, raw));
              return;
            }
            if (fixture.type === "porch-resize") {
              e.preventDefault();
              el.setPointerCapture(e.pointerId);
              const cursorM = pxToMetres(raw, layout);
              dragRef.current = {
                mode: "porch-resize",
                ...startPorchResize(room, fixture.which, cursorM, layout.metres),
                id: room.id,
                start: { ...room },
              };
              setHover(hintAt({ id: room.id, kind: fixture.kind, type: "porch-resize" }, raw));
              return;
            }
            e.preventDefault();
            el.setPointerCapture(e.pointerId);
            const cursorM = pxToMetres(raw, layout);
            dragRef.current = {
              ...startFixtureDrag(fixture.type, room, cursorM, innerMetres, layout.metres),
              id: room.id,
              start: { ...room },
            };
            setHover(hintAt({ id: room.id, kind: "move", type: fixture.type }, raw));
            return;
          }
        }
        if (handle === "move" || (isPorch(room) && porchFootprints(room).some((part) => pointInPxRect(roomToPx(part, layout), raw)))) {
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
        if (isPorch(room)) continue;
        const verts = [
          { x: r.x, y: r.y },
          { x: r.x + r.w, y: r.y },
          { x: r.x + r.w, y: r.y + r.h },
          { x: r.x, y: r.y + r.h },
        ];
        const edge = roomResizeEdgeHit(room, verts, raw);
        if (edge) {
          e.preventDefault();
          el.setPointerCapture(e.pointerId);
          dragRef.current = {
            mode: "edge",
            id: room.id,
            side: roomSideFromEdge(edge.index),
            start: withLayoutLongIsX(room),
          };
          return;
        }
      }
      const depthsNow = normalizeEaveDepths(eaveDepthsRef.current, buildingMetres.length);
      const perimeter = pickPerimeterHit(buildingMetres, depthsNow, layout, raw);
      if (perimeter?.kind === "eave") {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        freezeLayoutRef.current = {
          scale: layout.scale,
          originX: layout.originX,
          originY: layout.originY,
          offsetX: layout.offsetX,
          offsetY: layout.offsetY,
        };
        const run = perimeter.eave.run;
        const primary = closestEaveEdge(buildingMetres, run.edges, pxToMetres(raw, layout));
        const original = depthsNow.slice();
        const grouped = eaveEdgesByDepth(original, run.edges);
        const alreadyJoined = grouped.extended.length > 0;
        dragRef.current = {
          mode: "eave",
          active: [...run.edges],
          originActive: alreadyJoined ? [...grouped.extended] : [...run.edges],
          baseEdges: alreadyJoined ? [...grouped.base] : [],
          startDepths: original.slice(),
          originalDepths: original,
          primary: alreadyJoined ? grouped.extended[0] : primary,
          nx: run.nx,
          ny: run.ny,
          grab: pxToMetres(raw, layout),
          joined: alreadyJoined,
          joinDelta: 0,
          meetDelta: 0,
        };
        setHover(
          hintAt(
            {
              id: "eave",
              type: "eave",
              kind: Math.abs(run.ny) >= Math.abs(run.nx) ? "ns" : "ew",
              edges: [...run.edges],
              depthLabel: eaveDepthLabel(depthsNow, run.edges),
            },
            raw
          )
        );
        return;
      }
      const buildingHit = perimeter?.kind === "building" ? perimeter.building : null;
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
        setHover(
          hintAt(
            {
              id: "building",
              kind: buildingHit.axis === "h" ? "ns" : "ew",
              type: "resize-building",
              edgeIndex: buildingHit.index,
            },
            raw
          )
        );
      }
    },
    [buildingMetres, innerMetres, layout, updateRoom, viewMode]
  );

  const onStagePointerMove = useCallback(
    (e) => {
      if (!layout) return;
      const el = stageRef.current;
      if (!el) return;
      const raw = pointFromEvent(el, e);
      const cursorM = pxToMetres(raw, layout);
      const drag = dragRef.current;
      if (drag?.mode === "walk-marker") {
        const next = {
          x: snapMetresToStep(cursorM.x),
          y: snapMetresToStep(cursorM.y),
        };
        const current = walkMarkersRef.current;
        if (drag.kind === "start") {
          setWalkStart(next);
          if (current) walkMarkersRef.current = { ...current, start: next };
        } else if (drag.kind === "finish") {
          setWalkFinish(next);
          if (current) walkMarkersRef.current = { ...current, finish: next };
        } else if (drag.kind === "stop") {
          setWalkStops((prev) =>
            prev.map((stop, i) => (i === drag.index ? { ...stop, x: next.x, y: next.y } : stop))
          );
          if (current) {
            walkMarkersRef.current = {
              ...current,
              stops: (current.stops || []).map((stop, i) =>
                i === drag.index ? { ...stop, x: next.x, y: next.y } : stop
              ),
            };
          }
        }
        return;
      }
      if (!drag && walkSetupRef.current && hitWalkMarker(raw, layout, walkMarkersRef.current)) {
        setHover({ kind: "move", id: "walk-marker" });
        return;
      }
      if (viewMode) {
        setHover(null);
        return;
      }
      const hs = handlePx(layout);

      if (drag?.mode === "design-move") {
        const dx = snapMetresToStep(cursorM.x - drag.grab.x);
        const dy = snapMetresToStep(cursorM.y - drag.grab.y);
        if (dx !== drag.dx || dy !== drag.dy) {
          drag.dx = dx;
          drag.dy = dy;
          const next = translateDesign(drag.startMetres, drag.startRooms, dx, dy);
          applyBuildingMetres(next.metres);
          onRoomsChange(next.rooms);
        }
        setHover(hintAt({ id: "design", kind: "move", type: "design-move" }, raw));
        return;
      }
      if (drag?.mode === "design-rotate") {
        if (Math.hypot(raw.x - drag.startRaw.x, raw.y - drag.startRaw.y) > 4) drag.moved = true;
        if (drag.moved) {
          let delta = Math.atan2(raw.y - drag.centre.y, raw.x - drag.centre.x) - drag.startAngle;
          delta = Math.atan2(Math.sin(delta), Math.cos(delta));
          const turns = ((Math.round(delta / (Math.PI / 2)) % 4) + 4) % 4;
          if (turns !== drag.turns) {
            drag.turns = turns;
            const next = rotateDesign90(drag.startMetres, drag.startRooms, turns);
            applyBuildingMetres(next.metres);
            onRoomsChange(next.rooms);
          }
        }
        setHover(hintAt({ id: "design", kind: "rotate", type: "design-rotate" }, raw));
        return;
      }

      if (drag?.mode === "kitchen-bench") {
        drag.cur = nearestParamOnLoop(drag.loop, cursorM, drag.cur);
        const end = snapLoopParam(drag.loop, drag.cur);
        drag.bench = benchAlongLoop(drag.loop, drag.anchor, end, KITCHEN_BENCH_M);
        setBenchPreview(
          drag.bench ? { poly: drag.bench.poly } : { stub: loopPointAt(drag.loop, drag.anchor) }
        );
        setHover(hintAt({ id: drag.id, kind: "move", type: "kitchen-custom" }, raw));
        return;
      }

      const benchWall = drag ? null : armedBenchWallAt(raw, layout, innerMetres, roomsRef.current);
      if (benchWall) {
        setBenchPreview({ stub: loopPointAt(benchWall.loop, benchWall.s) });
        setHover(hintAt({ id: benchWall.room.id, kind: "move", type: "kitchen-custom" }, raw));
        return;
      }
      if (!drag) setBenchPreview(null);

      if (drag?.mode === "porch-resize") {
        const next = resizePorchEnd(drag.start, drag.which, cursorM, drag.grabAlong, layout.metres);
        updateRoom(drag.id, next);
        const handle = porchResizeHandles(next, layout.metres).find((h) => h.which === drag.which);
        setHover(
          hintAt(
            { id: drag.id, kind: handle?.axis || "ew", type: "porch-resize" },
            raw
          )
        );
        return;
      }
      if (drag?.mode === "move") {
        const nx = drag.start.x + (cursorM.x - drag.grab.x);
        const ny = drag.start.y + (cursorM.y - drag.grab.y);
        const porch = isPorch(drag.start);
        if (porch) {
          updateRoom(drag.id, slidePorch(drag.start, cursorM, drag.grab, layout.metres));
          setHover(hintAt({ id: drag.id, kind: "move", type: "porch-move" }, raw));
          return;
        }
        const next = hasCustomBench(drag.start)
          ? {
              ...drag.start,
              x: roundMm(drag.start.x + snapMetresToStep(nx - drag.start.x)),
              y: roundMm(drag.start.y + snapMetresToStep(ny - drag.start.y)),
            }
          : mergeRoomWalls(
              snapRoomToGrid({ ...drag.start, x: nx, y: ny }),
              wallCentreLines(layout.metres, roomsRef.current, drag.id, innerMetres)
            );
        const current =
          roomsRef.current.find((r) => r.id === drag.id) || drag.start;
        updateRoom(
          drag.id,
          porch
            ? keepPorchOutside(current, next, layout.metres, { slide: true })
            : keepRoomInside(drag.start, next, innerMetres)
        );
        setHover(hintAt({ id: drag.id, kind: "move", type: porch ? "porch-move" : "room-move" }, raw));
        return;
      }
      if (drag?.mode === "edge") {
        const start = drag.start;
        const { minW, minH } = roomMinSize(start);
        let next = { ...start };
        if (drag.side === "left") {
          const right = start.x + start.w;
          next.x = Math.min(cursorM.x, right - minW);
          next.w = right - next.x;
        } else if (drag.side === "right") {
          next.w = Math.max(minW, cursorM.x - start.x);
        } else if (drag.side === "top") {
          const bottom = start.y + start.h;
          next.y = Math.min(cursorM.y, bottom - minH);
          next.h = bottom - next.y;
        } else if (drag.side === "bottom") {
          next.h = Math.max(minH, cursorM.y - start.y);
        }
        const limit = innerMetres;
        const pinToWall = cursorAtOrPastInnerEdge(drag.side, cursorM, limit, 0.001);
        if (isLaundry(start)) {
          next = resizeLaundry(start, drag.side, next, limit);
        } else if (pinToWall) {
          next = pinRoomEdgeToInner(start, drag.side, limit);
          next = clampRoomEdgeInInner(start, next, drag.side, limit);
        } else {
          next = snapRoomEdgeToGrid(start, drag.side, next);
          next = mergeRoomSideWall(
            next,
            drag.side,
            wallCentreLines(layout.metres, roomsRef.current, drag.id, innerMetres)
          );
          next = clampRoomEdgeInInner(start, next, drag.side, limit);
        }
        const resized = { ...start, ...next };
        updateRoom(
          drag.id,
          roomKind(resized) === "kitchen" ? compactKitchenAppliances(resized) : resized
        );
        setHover(
          hintAt(
            {
              id: drag.id,
              kind: drag.side === "top" || drag.side === "bottom" ? "ns" : "ew",
              type: "resize",
            },
            raw
          )
        );
        return;
      }
      if (drag?.mode === "door") {
        const next = isPorch(drag.start)
          ? movePorchFrontDoor(drag.start, cursorM, drag.grabAlong, layout.metres)
          : moveBedroomDoor(drag.start, cursorM, drag.grabAlong, innerMetres);
        updateRoom(drag.id, next);
        setHover(hintAt({ id: drag.id, kind: "move", type: "door" }, raw));
        return;
      }
      if (drag?.mode === "robe") {
        const next = moveBedroomRobe(drag.start, cursorM, drag.grabAlong, innerMetres);
        updateRoom(drag.id, next);
        setHover(hintAt({ id: drag.id, kind: "move", type: "robe" }, raw));
        return;
      }
      if (drag?.mode === "robe-resize") {
        const next = moveBedroomRobeSize(
          drag.start,
          drag.which,
          cursorM,
          drag.grabAlong,
          innerMetres
        );
        updateRoom(drag.id, next);
        setHover(
          hintAt(
            {
              id: drag.id,
              kind: robeResizeAxis(bedroomDoorAndRobe(drag.start, innerMetres)),
              type: "robe-resize",
            },
            raw
          )
        );
        return;
      }
      if (drag?.mode === "bed") {
        const next = moveBedroomBed(drag.start, cursorM, drag.grabAlong, innerMetres);
        updateRoom(drag.id, next);
        setHover(hintAt({ id: drag.id, kind: "move", type: "bed" }, raw));
        return;
      }
      if (drag?.mode === "shower-resize") {
        const next = moveShowerLength(drag.start, drag.which, cursorM, drag.grab);
        updateRoom(drag.id, next);
        setHover(hintAt({ id: drag.id, kind: showerLongAxis(next) ? "ew" : "ns", type: "shower-resize" }, raw));
        return;
      }
      if (drag?.mode === "shower") {
        const { shower } = bathroomFixtures(drag.start);
        updateRoom(
          drag.id,
          moveRoomItemRect(drag.start, shower, cursorM, drag.grab, "showerX", "showerY")
        );
        setHover(hintAt({ id: drag.id, kind: "move", type: "shower" }, raw));
        return;
      }
      if (drag?.mode === "toilet") {
        const next = moveBathroomToilet(drag.start, cursorM, drag.grabAlong);
        updateRoom(drag.id, next);
        setHover(hintAt({ id: drag.id, kind: "move", type: "toilet" }, raw));
        return;
      }
      if (drag?.mode === "laundry-bench") {
        const next = moveLaundryBench(drag.start, cursorM, innerMetres);
        updateRoom(drag.id, next);
        setHover(hintAt({ id: drag.id, kind: "move", type: "laundry-bench" }, raw));
        return;
      }
      if (drag?.mode === "laundry-wm") {
        const next = moveLaundryWm(drag.start, cursorM, innerMetres);
        updateRoom(drag.id, next);
        setHover(hintAt({ id: drag.id, kind: "move", type: "laundry-wm" }, raw));
        return;
      }
      if (drag?.mode === "laundry-sink") {
        const next = moveLaundrySink(drag.start, cursorM, innerMetres);
        updateRoom(drag.id, next);
        setHover(hintAt({ id: drag.id, kind: "move", type: "laundry-sink" }, raw));
        return;
      }
      if (drag?.mode === "vanity") {
        const next = moveBathroomVanity(drag.start, cursorM, drag.grabAlong, innerMetres);
        updateRoom(drag.id, next);
        setHover(hintAt({ id: drag.id, kind: "move", type: "vanity" }, raw));
        return;
      }
      if (drag?.mode === "cook" || drag?.mode === "sink" || drag?.mode === "pantry" || drag?.mode === "fridge") {
        const live = roomsRef.current.find((r) => r.id === drag.id) || drag.start;
        const next = moveKitchenAppliance(live, drag.mode, cursorM, drag.grabAlong);
        updateRoom(drag.id, next);
        setHover(hintAt({ id: drag.id, kind: "move", type: drag.mode }, raw));
        return;
      }
      if (drag?.mode === "kitchen-run") {
        const next = moveKitchenRun(drag.start, drag.which, cursorM, drag.grabAlong);
        updateRoom(drag.id, next);
        setHover(
          hintAt(
            {
              id: drag.id,
              kind: kitchenRunResizeKind(drag.start),
              type: "kitchen-run",
            },
            raw
          )
        );
        return;
      }
      if (drag?.mode === "eave") {
        const metres = buildingMetresRef.current;
        const rawDelta = (cursorM.x - drag.grab.x) * drag.nx + (cursorM.y - drag.grab.y) * drag.ny;
        const applied = stepEaveDrag(drag, metres, rawDelta);
        eaveDepthsRef.current = applied.depths;
        setEaveDepths(applied.depths);
        const runNow = eaveRuns(metres, applied.depths).find((item) => item.edges.includes(drag.primary));
        setHover(
          hintAt(
            {
              id: "eave",
              type: "eave",
              kind: Math.abs(drag.ny) >= Math.abs(drag.nx) ? "ns" : "ew",
              edges: runNow ? [...runNow.edges] : [...drag.active],
              depthLabel: eaveDepthLabel(applied.depths, runNow ? runNow.edges : drag.active),
            },
            raw
          )
        );
        return;
      }
      if (drag?.mode === "building-edge") {
        const live = buildingMetresRef.current?.length ? buildingMetresRef.current : drag.metres;
        let moved = clampEdgeMove(live, drag.index, cursorM, maxAreaM2, 1);
        moved = clampBuildingEdgeToRooms(
          drag.metres,
          moved,
          drag.index,
          roomsRef.current
        );
        moved = clampBuildingEdgeToPorches(
          drag.metres,
          moved,
          drag.index,
          roomsRef.current
        );
        if (buildingSnap) {
          moved = snapBuildingEdgeMove(moved, drag.index, roomsRef.current, {
            grid: false,
            thresh: BUILDING_STEP_M * 0.45,
          });
        }
        moved = snapBuildingEdgeToStep(drag.metres, moved, drag.index, BUILDING_STEP_M);
        if (maxAreaM2 > 0 && polygonAreaM2(moved, 1) > maxAreaM2 + 1e-9) {
          const capped = clampEdgeMove(live, drag.index, cursorM, maxAreaM2, 1);
          const snapped = snapBuildingEdgeToStep(
            drag.metres,
            capped,
            drag.index,
            BUILDING_STEP_M
          );
          moved = keepMovedUnderArea(snapped, capped, maxAreaM2, 1);
        }
        moved = snapBuildingEdgeToStep(drag.metres, moved, drag.index, BUILDING_STEP_M);
        applyBuildingMetres(moved);
        const a = layout.pts[drag.index];
        const b = layout.pts[(drag.index + 1) % layout.pts.length];
        setHover(
          hintAt(
            {
              id: "building",
              kind: a && b && edgeAxis(a, b) === "h" ? "ns" : "ew",
              type: "resize-building",
              edgeIndex: drag.index,
            },
            raw
          )
        );
        return;
      }

      let nextHover = null;
      const designHover = hitDesignHandle(layout, roomsRef.current, raw);
      if (designHover) {
        setHover(
          hintAt(
            { id: "design", kind: designHover === "design-move" ? "move" : "rotate", type: designHover },
            raw
          )
        );
        return;
      }
      const stacked = roomsStackOrder(roomsRef.current);
      for (let i = stacked.length - 1; i >= 0; i -= 1) {
        const room = stacked[i];
        const r = roomToPx(room, layout);
        const handle = hitRoomHandle(r, raw, hs);
        if (handle === "delete") {
          nextHover = { id: room.id, kind: "rotate", type: "room-delete" };
          break;
        }
        if (hitCouchOptions(room, layout, raw)) {
          nextHover = { id: room.id, kind: "rotate", type: "couch-options" };
          break;
        }
        if (roomKind(room) === "kitchen" && hitKitchenLayoutHandle(r, raw, hs)) {
          nextHover = { id: room.id, kind: "rotate", type: "kitchen-layout" };
          break;
        }
        if (roomKind(room) === "bathroom") {
          const { shower } = bathroomFixtures(room);
          const resize = hitShowerResizeHandle(shower, room, layout, raw);
          if (resize) {
            nextHover = { id: room.id, kind: resize.kind, type: "shower-resize" };
            break;
          }
          if (hitShowerRotateHandle(shower, layout, raw)) {
            nextHover = { id: room.id, kind: "rotate", type: "shower-rotate" };
            break;
          }
        }
        if (handle === "rotate") {
          nextHover = { id: room.id, kind: "rotate", type: "room-rotate" };
          break;
        }
        if (roomKind(room) === "kitchen") {
          if (hitSinkMirrorHandle(room, layout, raw)) {
            nextHover = { id: room.id, kind: "rotate", type: "sink-mirror" };
            break;
          }
          const appHit = hitKitchenApplianceHandle(room, layout, raw);
          if (appHit) {
            nextHover = { id: room.id, kind: "move", type: appHit.type };
            break;
          }
          const runHit = hitKitchenRunHandle(room, layout, raw);
          if (runHit) {
            nextHover = { id: room.id, kind: runHit.kind, type: "kitchen-run" };
            break;
          }
        }
        if (roomKind(room) === "bedroom") {
          const fixture = hitBedroomFixtureHandle(room, layout, raw, innerMetres);
          if (fixture) {
            nextHover = { id: room.id, kind: fixture.kind || "move", type: fixture.type };
            break;
          }
        }
        if (isBathLike(room)) {
          const fixture = hitBathroomFixtureHandle(room, layout, raw, innerMetres);
          if (fixture) {
            nextHover = { id: room.id, kind: fixture.kind || "move", type: fixture.type };
            break;
          }
        }
        if (isLaundryRoom(room)) {
          const fixture = hitLaundryFixtureHandle(room, layout, raw, innerMetres);
          if (fixture) {
            nextHover = { id: room.id, kind: fixture.kind || "move", type: fixture.type };
            break;
          }
        }
        if (isPorch(room)) {
          const fixture = hitPorchFixtureHandle(room, layout, raw, layout.metres);
          if (fixture) {
            nextHover = { id: room.id, kind: fixture.kind || "move", type: fixture.type };
            break;
          }
        }
        if (handle === "move" || (isPorch(room) && porchFootprints(room).some((part) => pointInPxRect(roomToPx(part, layout), raw)))) {
          nextHover = {
            id: room.id,
            kind: "move",
            type: isPorch(room) ? "porch-move" : "room-move",
          };
          break;
        }
        if (isPorch(room)) continue;
        const verts = [
          { x: r.x, y: r.y },
          { x: r.x + r.w, y: r.y },
          { x: r.x + r.w, y: r.y + r.h },
          { x: r.x, y: r.y + r.h },
        ];
        const edge = roomResizeEdgeHit(room, verts, raw);
        if (edge) {
          nextHover = {
            id: room.id,
            kind: edge.axis === "h" ? "ns" : "ew",
            type: "resize",
          };
          break;
        }
      }
      if (!nextHover) {
        const depthsNow = normalizeEaveDepths(eaveDepthsRef.current, buildingMetresRef.current.length);
        const perimeter = pickPerimeterHit(buildingMetresRef.current, depthsNow, layout, raw);
        if (perimeter?.kind === "eave") {
          const run = perimeter.eave.run;
          nextHover = {
            id: "eave",
            type: "eave",
            kind: Math.abs(run.ny) >= Math.abs(run.nx) ? "ns" : "ew",
            edges: [...run.edges],
            depthLabel: eaveDepthLabel(depthsNow, run.edges),
          };
        } else if (perimeter?.kind === "building") {
          const buildingHit = perimeter.building;
          nextHover = {
            id: "building",
            kind: buildingHit.axis === "h" ? "ns" : "ew",
            type: "resize-building",
            edgeIndex: buildingHit.index,
          };
        }
      }
      setHover(hintAt(nextHover, raw));
    },
    [
      applyBuildingMetres,
      buildingSnap,
      innerMetres,
      layout,
      maxAreaM2,
      onRoomsChange,
      updateRoom,
      viewMode,
    ]
  );

  const onStagePointerUp = useCallback(
    (e) => {
      const el = stageRef.current;
      if (el && e?.pointerId != null) {
        try {
          el.releasePointerCapture(e.pointerId);
        } catch {
          /* already released */
        }
      }
      const drag = dragRef.current;
      const wasBuilding = drag?.mode === "building-edge";
      const wasEave = drag?.mode === "eave";
      dragRef.current = null;
      if (wasEave) {
        freezeLayoutRef.current = null;
        setViewTick((t) => t + 1);
      }
      if (drag?.mode === "walk-marker" && drag.ownedFreeze) {
        freezeLayoutRef.current = null;
        setViewTick((t) => t + 1);
      }
      if (wasBuilding) {
        setBuildingMetres((prev) => prev.map((p) => ({ x: p.x, y: p.y })));
      }
      if (drag?.mode === "design-rotate") {
        if (!drag.moved) {
          const next = rotateDesign90(drag.startMetres, drag.startRooms, 1);
          applyBuildingMetres(next.metres);
          onRoomsChange(next.rooms);
        }
        setHover(null);
      }
      if (drag?.mode === "kitchen-bench") {
        setBenchPreview(null);
        setHover(null);
        if (drag.bench) {
          onRoomsChange((prev) =>
            prev.map((r) => (r.id === drag.id ? finalizeCustomBench(r, drag.bench) : r))
          );
        }
      }
    },
    [applyBuildingMetres, onRoomsChange]
  );

  const deleteTarget = deleteTargetId ? rooms.find((r) => r.id === deleteTargetId) || null : null;
  const cancelDelete = useCallback(() => setDeleteTargetId(null), []);
  const confirmDelete = useCallback(() => {
    const id = deleteTargetId;
    setDeleteTargetId(null);
    if (id) onRoomsChange((prev) => prev.filter((r) => r.id !== id));
  }, [deleteTargetId, onRoomsChange]);

  const cancelClear = useCallback(() => setClearOpen(false), []);
  const confirmClear = useCallback(() => {
    setClearOpen(false);
    dragRef.current = null;
    setHover(null);
    onRoomsChange([]);
  }, [onRoomsChange]);

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
          width: "calc(100vw - 24px)",
          height: "calc(100vh - 24px)",
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
          <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setBuildingSnap((on) => !on)}
              aria-pressed={buildingSnap}
              style={snapToggleStyle(buildingSnap)}
            >
              Snap
            </button>
            <button
              type="button"
              onClick={() => onMaxAreaChange?.(!maxArea)}
              aria-pressed={maxArea}
              style={snapToggleStyle(maxArea)}
            >
              {maxArea ? "Max 60 m²" : "Any size"}
            </button>
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
            <button
              type="button"
              onClick={addPowder}
              disabled={!layout}
              style={{
                ...toolbarButtonStyle(Boolean(layout)),
                width: "100%",
                minWidth: 0,
              }}
            >
              Add Powder Room
            </button>
            <button
              type="button"
              onClick={addLaundry}
              disabled={!layout}
              style={{
                ...toolbarButtonStyle(Boolean(layout)),
                width: "100%",
                minWidth: 0,
              }}
            >
              Add Euro Laundry
            </button>
            <button
              type="button"
              onClick={addLaundryRoom}
              disabled={!layout}
              style={{
                ...toolbarButtonStyle(Boolean(layout)),
                width: "100%",
                minWidth: 0,
              }}
            >
              Add Laundry
            </button>
            <button
              type="button"
              onClick={addKitchen}
              disabled={!layout}
              style={{
                ...toolbarButtonStyle(Boolean(layout)),
                width: "100%",
                minWidth: 0,
              }}
            >
              Add Kitchen
            </button>
            <button
              type="button"
              onClick={addPorch}
              disabled={!layout}
              style={{
                ...toolbarButtonStyle(Boolean(layout)),
                width: "100%",
                minWidth: 0,
              }}
            >
              Add Porch
            </button>
            <button
              type="button"
              onClick={addLivingSet}
              disabled={!layout}
              style={{
                ...toolbarButtonStyle(Boolean(layout)),
                width: "100%",
                minWidth: 0,
              }}
            >
              Add Living Room
            </button>
            <button
              type="button"
              onClick={() => setClearOpen(true)}
              disabled={!layout || rooms.length === 0}
              style={{
                ...toolbarButtonStyle(Boolean(layout) && rooms.length > 0),
                width: "100%",
                minWidth: 0,
                marginTop: 16,
              }}
            >
              Clear
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
                  {roomKindLabel(kind)} {n}
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
              ...(layout && !viewMode
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
                  <defs>
                    <clipPath id="qc-living-clip">
                      <polygon
                        points={(innerPts || layout.pts).map((p) => `${p.x},${p.y}`).join(" ")}
                      />
                    </clipPath>
                    {FloorFinishDefs({ prefix: "qc-floor", layout })}
                  </defs>
                  {innerPts ? (
                    <path
                      d={`${polygonPathD(layout.pts)} ${polygonPathD(innerPts)}`}
                      fill={WALL_FILL}
                      fillRule="evenodd"
                    />
                  ) : null}
                  <path
                    d={livingPathD(innerPts || layout.pts, layout, rooms)}
                    fill="url(#qc-floor-hybrid)"
                    fillRule="evenodd"
                    clipPath="url(#qc-living-clip)"
                  />
                  <polygon
                    points={layout.pts.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={WALL_FILL}
                    strokeWidth={PLAN_LINE}
                    strokeLinejoin="round"
                  />
                  {innerPts ? (
                    <polygon
                      points={innerPts.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke={WALL_FILL}
                      strokeWidth={PLAN_LINE}
                      strokeLinejoin="round"
                    />
                  ) : null}
                  {eaveRunList.length ? (
                    <path
                      d={eavePathD(eaveRunList, layout)}
                      fill="none"
                      stroke="#111111"
                      strokeWidth="1.35"
                      strokeDasharray="7 5"
                      strokeLinejoin="miter"
                    />
                  ) : null}
                  {hover?.type === "eave"
                    ? eaveRunList
                        .filter((run) => (hover.edges || []).some((edge) => run.edges.includes(edge)))
                        .map((run) => {
                          const a = mPointToPx(run.a, layout);
                          const b = mPointToPx(run.b, layout);
                          return (
                            <line
                              key={`eave-hot-${run.edges.join("-")}`}
                              x1={a.x}
                              y1={a.y}
                              x2={b.x}
                              y2={b.y}
                              stroke="#111111"
                              strokeWidth="2.6"
                              strokeDasharray="7 5"
                              strokeLinecap="butt"
                            />
                          );
                        })
                    : null}
                  {hover?.id === "building" && hover.edgeIndex != null ? (
                    <line
                      x1={layout.pts[hover.edgeIndex].x}
                      y1={layout.pts[hover.edgeIndex].y}
                      x2={layout.pts[(hover.edgeIndex + 1) % layout.pts.length].x}
                      y2={layout.pts[(hover.edgeIndex + 1) % layout.pts.length].y}
                      stroke="#ca8a04"
                      strokeWidth={PLAN_LINE_HOVER}
                      strokeLinecap="round"
                    />
                  ) : null}
                  {rooms.filter((room) => !isLivingSet(room)).map(renderPlanRoom)}
                  {partitionWallsPx.map((s, i) => (
                    <line
                      key={`iw-${i}`}
                      x1={s.x1}
                      y1={s.y1}
                      x2={s.x2}
                      y2={s.y2}
                      stroke={WALL_FILL}
                      strokeWidth={Math.max(PLAN_LINE, WALL_THICKNESS_M * layout.scale)}
                      strokeLinecap="butt"
                    />
                  ))}
                  {partitionWallCornersPx.map((c, i) => {
                    const t = Math.max(PLAN_LINE, WALL_THICKNESS_M * layout.scale);
                    return (
                      <rect
                        key={`iwc-${i}`}
                        x={c.x - t / 2}
                        y={c.y - t / 2}
                        width={t}
                        height={t}
                        fill={WALL_FILL}
                      />
                    );
                  })}
                  {rooms.map((room) => {
                    const door = roomDoorSwing(room, innerMetres);
                    if (!door?.sliding) return null;
                    return <PlanSlidingDoor key={`slide-${room.id}`} door={door} layout={layout} />;
                  })}
                  {rooms.filter((room) => !isLivingSet(room)).map(renderRoomHandles)}
                  {rooms.filter(isLivingSet).map(renderPlanRoom)}
                  {benchPreview && !viewMode ? <BenchDrawPreview preview={benchPreview} layout={layout} /> : null}
                  {walkMarkersRef.current && layout ? (
                    <WalkPathOverlay layout={layout} markers={walkMarkersRef.current} />
                  ) : null}
                  {designHandles ? (
                    <>
                      <DesignMoveHandle
                        cx={designHandles.move.cx}
                        cy={designHandles.move.cy}
                        size={designHandles.size}
                        color={MONUMENT}
                      />
                      <RotateHandle
                        cx={designHandles.rotate.cx}
                        cy={designHandles.rotate.cy}
                        size={designHandles.size}
                        color={MONUMENT}
                      />
                    </>
                  ) : null}
                </svg>
                {layout?.areaM2 > 0 && areaAnchorM ? (
                  <div
                    title="Drag to move"
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      e.stopPropagation();
                      e.preventDefault();
                      e.currentTarget.setPointerCapture?.(e.pointerId);
                      areaDragRef.current = {
                        pointerId: e.pointerId,
                        startX: e.clientX,
                        startY: e.clientY,
                        start: areaOffsetM,
                      };
                    }}
                    onPointerMove={(e) => {
                      e.stopPropagation();
                      const drag = areaDragRef.current;
                      if (!drag || drag.pointerId !== e.pointerId || !(layout.scale > 0)) return;
                      setAreaOffsetM({
                        dx: drag.start.dx + (e.clientX - drag.startX) / layout.scale,
                        dy: drag.start.dy + (e.clientY - drag.startY) / layout.scale,
                      });
                    }}
                    onPointerUp={(e) => {
                      e.stopPropagation();
                      if (areaDragRef.current?.pointerId === e.pointerId) areaDragRef.current = null;
                    }}
                    onPointerCancel={(e) => {
                      e.stopPropagation();
                      areaDragRef.current = null;
                    }}
                    style={{
                      position: "absolute",
                      left: (areaAnchorM.x + areaOffsetM.dx) * layout.scale + layout.originX,
                      top:
                        (areaAnchorM.y + areaOffsetM.dy) * layout.scale +
                        layout.originY +
                        AREA_LABEL_GAP_PX,
                      transform: "translateX(-50%)",
                      zIndex: 6,
                      color: MONUMENT,
                      fontSize: "0.95rem",
                      fontWeight: 700,
                      letterSpacing: "0.02em",
                      whiteSpace: "nowrap",
                      cursor: viewMode ? "default" : "grab",
                      pointerEvents: viewMode ? "none" : "auto",
                      touchAction: "none",
                      textShadow:
                        "0 0 4px #fff, 0 0 4px #fff, 0 1px 2px rgba(255,255,255,0.9)",
                    }}
                  >
                    {formatSqm(layout.areaM2)}
                  </div>
                ) : null}
                {livingPt ? (
                  <RoomDimLabel
                    x={livingPt.x * layout.scale + layout.originX}
                    y={livingPt.y * layout.scale + layout.originY}
                    title="Living"
                    subtitle={livingDims ? formatRoomMetres(livingDims.w, livingDims.h) : null}
                  />
                ) : null}
                {showDimensions ? (
                  <PlanDimensionsOverlay
                    layout={layout}
                    rooms={rooms}
                    innerMetres={innerMetres || layout.metres}
                    walls={partitionWalls}
                    width={size.w}
                    height={size.h}
                  />
                ) : viewMode ? null : (
                  buildingSideLabels.map((side) => (
                    <EdgeDimLabel
                      key={side.key}
                      x={side.x}
                      y={side.y}
                      text={side.label}
                      angleDeg={side.angleDeg}
                      color={WHITE}
                    />
                  ))
                )}
                {rooms.map((room) => {
                  if (isLivingSet(room)) return null;
                  const host = isPorch(room) ? porchHostRect(room, layout.metres) : room;
                  const r = roomToPx(host, layout);
                  return (
                    <RoomDimLabel
                      key={`${room.id}-label`}
                      x={r.x + r.w / 2}
                      y={r.y + r.h / 2}
                      title={roomKindLabel(roomKind(room))}
                      subtitle={hasCustomBench(room) ? null : formatRoomMetres(host.w, host.h)}
                    />
                  );
                })}
                {viewMode ? null : (
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
                )}
                {hover?.hint ? (
                  <div
                    style={{
                      position: "absolute",
                      left: Math.max(12, hover.x || 0),
                      top: Math.max(12, (hover.y || 0) - 8),
                      transform: "translate(-50%, -100%)",
                      pointerEvents: "none",
                      zIndex: 8,
                      background: "transparent",
                      color: WHITE,
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      letterSpacing: "0.02em",
                      padding: "5px 9px",
                      whiteSpace: "nowrap",
                      textShadow:
                        "0 0 4px #000, 0 0 4px #000, 0 1px 2px rgba(0,0,0,0.9)",
                    }}
                  >
                    {hover.hint}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            padding: "12px 18px",
            borderTop: `1px solid ${EXPLORER_BORDER}`,
            background: "#f3f3f3",
            flexShrink: 0,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => {
              dragRef.current = null;
              setHover(null);
              setViewMode((v) => !v);
            }}
            disabled={!layout}
            aria-pressed={viewMode}
            title={viewMode ? "Switch to edit mode" : "Switch to view mode"}
            style={{
              ...toolbarButtonStyle(Boolean(layout)),
              ...(viewMode ? { background: MONUMENT, color: WHITE, border: `1px solid ${MONUMENT}` } : null),
            }}
          >
            {viewMode ? "View Mode" : "Edit Mode"}
          </button>
          <button
            type="button"
            onClick={openPdfPreview}
            disabled={!layout || pdfCaptureOn || Boolean(pdfPreview)}
            style={toolbarButtonStyle(Boolean(layout) && !pdfCaptureOn && !pdfPreview)}
          >
            {pdfCaptureOn ? "Preparing…" : "Download"}
          </button>
          <button
            type="button"
            onClick={() => setClientSendOpen(true)}
            disabled={!layout}
            style={toolbarButtonStyle(Boolean(layout))}
          >
            Send To Client
          </button>
          <button
            type="button"
            onClick={() => {
              freezeLayoutRef.current = null;
              setShowDimensions((v) => !v);
            }}
            disabled={!layout}
            aria-pressed={showDimensions}
            style={{
              ...toolbarButtonStyle(Boolean(layout)),
              ...(showDimensions ? { background: MONUMENT, color: WHITE, border: `1px solid ${MONUMENT}` } : null),
            }}
          >
            Show Dimensions
          </button>
          <button
            type="button"
            onClick={() =>
              setWalkSetup((on) => {
                if (!on) freezeLayoutRef.current = null;
                return !on;
              })
            }
            disabled={!layout}
            aria-pressed={walkSetup}
            style={{
              ...toolbarButtonStyle(Boolean(layout)),
              ...(walkSetup ? { background: MONUMENT, color: WHITE, border: `1px solid ${MONUMENT}` } : null),
            }}
          >
            Set Up Walkthrough
          </button>
          {walkSetup ? (
            <>
              <button type="button" onClick={addWalkLocation} style={toolbarButtonStyle(true)}>
                Add location
              </button>
              <button type="button" onClick={addWalkPoint} style={toolbarButtonStyle(true)}>
                Add point
              </button>
              <button
                type="button"
                onClick={addWalkFinish}
                disabled={Boolean(walkFinish)}
                style={toolbarButtonStyle(!walkFinish)}
              >
                Add finish
              </button>
              <button type="button" onClick={clearWalkSetup} style={toolbarButtonStyle(true)}>
                Clear
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => {
              if (!layoutRef.current) return;
              setThreeDOpen(true);
            }}
            disabled={!layout}
            style={toolbarButtonStyle(Boolean(layout))}
          >
            3D
          </button>
          <button type="button" onClick={onClose} style={toolbarButtonStyle(true)}>
            OK
          </button>
        </div>
      </div>
      {clientSendOpen ? (
        <SendConceptClientModal
          address={address}
          quoteEmail={quoteEmail}
          quoteFirstName={quoteFirstName}
          metres={buildingMetres}
          rooms={rooms}
          eaveDepths={eaveDepths}
          walkStart={shownWalkStart}
          walkStops={walkStops}
          walkFinish={walkFinish}
          onClose={() => setClientSendOpen(false)}
        />
      ) : null}
      {threeDOpen && layout ? (
        <Design3DModal
          layout={layout}
          rooms={rooms}
          walkRoute={{ start: shownWalkStart, stops: walkStops, finish: walkFinish }}
          onAddLocation={() => {
            addWalkLocation();
            setThreeDOpen(false);
          }}
          onAddPoint={() => {
            addWalkPoint();
            setThreeDOpen(false);
          }}
          onAddFinish={() => {
            addWalkFinish();
            setThreeDOpen(false);
          }}
          onClearWalk={clearWalkSetup}
          onClose={() => setThreeDOpen(false)}
        />
      ) : null}
      {pdfPreview ? (
        <DesignPdfPreviewModal
          preview={pdfPreview}
          areaM2={layout?.areaM2}
          rooms={rooms}
          planQuarter={planQuarter}
          viewQuarter={viewQuarter}
          onRotatePlan={() => setPlanQuarter((q) => (q + 1) % 4)}
          onRotateView={() => setViewQuarter((q) => (q + 1) % 4)}
          onGenerate={() => void generatePdfFromPreview()}
          onClose={closePdfPreview}
          generating={pdfGenerating}
        />
      ) : null}
      {pdfCaptureOn && layout ? (
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: -12000,
            top: 0,
            width: 960,
            height: 660,
            overflow: "hidden",
            pointerEvents: "none",
            opacity: 0.01,
          }}
        >
          <QuickConcept3DPreview
            metres={layout.metres}
            rooms={roomsWithPorchSteps(rooms, layout.metres)}
            innerMetres={innerMetres}
            walls={partitionWalls}
            doors={collectDesignDoors(rooms, layout.metres, innerMetres || layout.metres)}
            captureRef={pdfCaptureRef}
          />
        </div>
      ) : null}
      {deleteTarget ? (
        <ConfirmModal
          title={`Delete ${roomKindLabel(roomKind(deleteTarget))}?`}
          message={`This removes the ${roomKindLabel(roomKind(deleteTarget)).toLowerCase()} and everything in it from the design.`}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      ) : null}
      {clearOpen ? (
        <ConfirmModal
          title="Clear design?"
          message="This removes every room, porch and living room from the design. The building shape stays."
          confirmLabel="Clear"
          onConfirm={confirmClear}
          onCancel={cancelClear}
        />
      ) : null}
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
  const designFrameRef = useRef(null);
  const designScaleRef = useRef(null);

  const [query, setQuery] = useState("");
  const [quotePick, setQuotePick] = useState("");
  const [quoteGroups, setQuoteGroups] = useState({ VIC: [], QLD: [] });
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
  const quoteContact = quoteContactFromPick(quotePick, quoteGroups);
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
  const mapInnerPts =
    polyClosed && displayPoly.length >= 3
      ? insetPolygon(displayPoly, WALL_THICKNESS_M * ppm)
      : null;
  const mapFrame = designFrameRef.current
    ? { ...designFrameRef.current, srcPpm: ppm }
    : polyClosed && displayPoly.length >= 3
      ? liveDesignFrame(displayPoly, ppm, null)
      : null;
  const mapRoomPolys = mapFrame
    ? designRooms
        .filter((room) => !isLivingSet(room))
        .map((room) => ({
          room,
          pts: roomToMapPixels(room, mapFrame),
        }))
    : [];
  const mapFootprintPx = (() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const add = (x, y) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };
    for (const p of displayPoly || []) add(p.x, p.y);
    for (const item of mapRoomPolys) {
      for (const p of item.pts || []) add(p.x, p.y);
    }
    if (!Number.isFinite(minX)) return null;
    return { minX, minY, maxX, maxY };
  })();
  const polySideLabels =
    displayPoly.length >= 2
      ? sideLengthLabels(displayPoly, Boolean(polyClosed), ppm, {
          clearPx: DIM_CLEAR_M * ppm,
          footprintPx: mapFootprintPx,
        })
      : [];
  const mapLivingHoles = mapRoomPolys
    .filter((item) => !isPorch(item.room))
    .map((item) => item.pts);
  const mapLivingMetres = mapFrame
    ? insetPolygon(mapFrame.metres, WALL_THICKNESS_M) || mapFrame.metres
    : null;
  const mapLivingRemain = mapLivingMetres
    ? livingRemainingRect(mapLivingMetres, walledRooms(designRooms))
    : null;
  const mapLivingPt =
    mapLivingRemain && mapFrame
      ? designMetresToPixels(
          [
            {
              x: mapLivingRemain.x + mapLivingRemain.w / 2,
              y: mapLivingRemain.y + mapLivingRemain.h / 2,
            },
          ],
          mapFrame
        )[0]
      : mapInnerPts
        ? polygonCentroid(mapInnerPts)
        : null;
  const mapLivingDims = mapLivingRemain
    ? { w: mapLivingRemain.w, h: mapLivingRemain.h }
    : null;
  const mapPartitionSegs = mapFrame
    ? bedroomBathroomInternalWalls(designRooms, mapLivingMetres || mapFrame.metres)
    : [];
  const mapPartitionWalls = mapPartitionSegs.map((seg) =>
    designMetresToPixels(wallSegMetres(seg), mapFrame)
  );
  const mapPartitionCorners = mapFrame
    ? partitionWallCorners(mapPartitionSegs).map((c) => designMetresToPixels([c], mapFrame)[0])
    : [];

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
    return clampRectFromPointsStepped(start, end, areaLimit(), ppmRef.current, BUILDING_STEP_M);
  }, [areaLimit]);
  const limitedPolyPoint = useCallback((vertices, cursor) => {
    const ppm = ppmRef.current;
    const stepPx = BUILDING_STEP_M * ppm;
    let p = snapOrthogonalCursor(vertices, cursor, snapRef.current);
    const last = vertices?.[vertices.length - 1];
    if (last) {
      const closing = vertices.length >= 3 && pointsNear(p, vertices[0]);
      const onVertex = vertices.some((v) => pointsNear(p, v));
      if (!closing && !onVertex) p = snapPixelLengthFrom(last, p, stepPx);
    }
    p = clampPolygonPoint(vertices, p, areaLimit(), ppm);
    if (last && vertices.length >= 1) {
      const closing = vertices.length >= 3 && pointsNear(p, vertices[0]);
      const onVertex = vertices.some((v) => pointsNear(p, v));
      if (!closing && !onVertex) {
        const floored = snapPixelLengthFrom(last, p, stepPx, "floor");
        if (polygonAreaM2([...vertices, floored], ppm) <= areaLimit() + 1e-9 || !(areaLimit() > 0)) {
          p = floored;
        }
      }
    }
    return p;
  }, [areaLimit]);

  const commitShape = useCallback((verts) => {
    setDraft(null);
    setRect(null);
    setPlacing(false);
    setPolyVertices(verts);
    setPolyCursor(null);
    setPolyClosed(true);
    polyRef.current = { vertices: verts, closed: true };
    designFrameRef.current = null;
    designScaleRef.current = null;
    setDesignRooms([]);
    bedroomIdRef.current = 0;
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
    designFrameRef.current = null;
    designScaleRef.current = null;
    setDesignRooms([]);
    bedroomIdRef.current = 0;
  }, []);

  const applyDesignBuilding = useCallback(
    (nextMetres) => {
      if (!nextMetres || nextMetres.length < 3) return;
      const frame = designFrameRef.current;
      if (!frame) return;
      const ppmNow = ppmRef.current;
      const nextFrame = {
        ...frame,
        metres: nextMetres.map((p) => ({ x: p.x, y: p.y })),
        srcPpm: ppmNow,
      };
      designFrameRef.current = nextFrame;
      const pixelVerts = designMetresToPixels(nextMetres, nextFrame);
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
    const ppmNow = ppmRef.current;
    const prev = designFrameRef.current;
    const frame = prev
      ? { ...prev, srcPpm: ppmNow }
      : liveDesignFrame(vertices, ppmNow, null);
    designFrameRef.current = frame;
    setDesign({
      vertices: vertices.map((p) => ({ x: p.x, y: p.y })),
      ppm: ppmNow,
      frame,
    });
  }, []);

  const onDesignViewScale = useCallback((s) => {
    if (!(s > 0)) return;
    if (designScaleRef.current == null) designScaleRef.current = s;
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
    designFrameRef.current = null;
    designScaleRef.current = null;
    setDesignRooms([]);
    bedroomIdRef.current = 0;
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
      const ppm = ppmRef.current;
      const maxM2 = areaLimit();
      const live = polyRef.current.vertices?.length ? polyRef.current.vertices : drag.vertices;
      const capped = clampEdgeMove(live, drag.index, raw, maxM2, ppm);
      let moved = snapBuildingEdgeToStep(
        drag.vertices,
        capped,
        drag.index,
        BUILDING_STEP_M * ppm
      );
      if (maxM2 > 0 && polygonAreaM2(moved, ppm) > maxM2 + 1e-9) {
        const resnapped = snapBuildingEdgeToStep(
          drag.vertices,
          clampEdgeMove(live, drag.index, raw, maxM2, ppm),
          drag.index,
          BUILDING_STEP_M * ppm
        );
        moved = keepMovedUnderArea(resnapped, capped, maxM2, ppm);
      }
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/quotes", { headers: getApiHeaders() });
        const data = await res.json().catch(() => []);
        if (cancelled) return;
        if (!res.ok || !Array.isArray(data)) {
          setQuoteGroups({ VIC: [], QLD: [] });
          return;
        }
        setQuoteGroups(groupQuoteAddresses(data));
      } catch {
        if (!cancelled) setQuoteGroups({ VIC: [], QLD: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/quotes", { headers: getApiHeaders() });
        const data = await res.json().catch(() => []);
        if (cancelled) return;
        if (!res.ok || !Array.isArray(data)) {
          setQuoteGroups({ VIC: [], QLD: [] });
          return;
        }
        setQuoteGroups(groupQuoteAddresses(data));
      } catch {
        if (!cancelled) setQuoteGroups({ VIC: [], QLD: [] });
      }
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

  const runSearch = useCallback(async (nextQuery) => {
    const q = String(nextQuery != null ? nextQuery : query).trim();
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

  const pickQuoteAddress = useCallback(
    (id) => {
      setQuotePick(id);
      if (!id) return;
      const item = [...quoteGroups.VIC, ...quoteGroups.QLD].find(
        (row) => String(row.id) === String(id)
      );
      const search = item.search || item.label;
      if (!search) return;
      setQuery(search);
      void runSearch(search);
    },
    [quoteGroups, runSearch]
  );

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
              justifyContent: "flex-end",
              flexShrink: 0,
              flexWrap: "wrap",
            }}
          >
            <select
              value={quotePick}
              onChange={(e) => pickQuoteAddress(e.target.value)}
              disabled={busy}
              aria-label="Quotes list addresses"
              style={{
                minWidth: "240px",
                maxWidth: "340px",
                padding: "10px 12px",
                fontSize: "0.9rem",
                borderRadius: "10px",
                border: `1px solid ${EXPLORER_BORDER}`,
                background: WHITE,
                color: MONUMENT,
                boxSizing: "border-box",
              }}
            >
              <option value="">Quotes list</option>
              {quoteGroups.VIC.length ? (
                <optgroup label="VIC">
                  {quoteGroups.VIC.map((row) => (
                    <option key={`vic-${row.id}`} value={String(row.id)}>
                      {row.label}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {quoteGroups.QLD.length ? (
                <optgroup label="QLD">
                  {quoteGroups.QLD.map((row) => (
                    <option key={`qld-${row.id}`} value={String(row.id)}>
                      {row.label}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (quotePick) setQuotePick("");
              }}
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
                width: "280px",
                maxWidth: "100%",
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
                    <EdgeDimLabel
                      key={side.key}
                      x={side.x}
                      y={side.y}
                      text={side.label}
                      angleDeg={side.angleDeg}
                      color={WHITE}
                    />
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
                        <>
                          {mapInnerPts ? (
                            <>
                              <path
                                d={`${polygonPathD(displayPoly)} ${polygonPathD(mapInnerPts)}`}
                                fill={showMap ? "rgba(245,245,245,0.88)" : WALL_FILL}
                                fillRule="evenodd"
                              />
                              <path
                                d={livingHolesPathD(mapInnerPts, mapLivingHoles)}
                                fill={LIVING_FILL}
                                fillRule="evenodd"
                              />
                            </>
                          ) : (
                            <polygon
                              points={displayPoly.map((p) => `${p.x},${p.y}`).join(" ")}
                              fill={shapeFill}
                            />
                          )}
                          {mapRoomPolys.map(({ room, pts }) => {
                            if (pts.length < 3) return null;
                            const colors = roomColors(room);
                            return (
                              <polygon
                                key={room.id}
                                points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                                fill={colors.fill}
                                stroke={colors.stroke}
                                strokeWidth={PLAN_LINE}
                                strokeLinejoin="round"
                              />
                            );
                          })}
                          <polygon
                            points={displayPoly.map((p) => `${p.x},${p.y}`).join(" ")}
                            fill="none"
                            stroke={shapeStroke}
                            strokeWidth={PLAN_LINE}
                            strokeLinejoin="round"
                          />
                          {mapInnerPts ? (
                            <polygon
                              points={mapInnerPts.map((p) => `${p.x},${p.y}`).join(" ")}
                              fill="none"
                              stroke={shapeStroke}
                              strokeWidth={PLAN_LINE}
                              strokeLinejoin="round"
                              opacity="0.9"
                            />
                          ) : null}
                          {mapPartitionWalls.map((pts, i) =>
                            pts?.length === 2 ? (
                              <line
                                key={`map-iw-${i}`}
                                x1={pts[0].x}
                                y1={pts[0].y}
                                x2={pts[1].x}
                                y2={pts[1].y}
                                stroke={WALL_FILL}
                                strokeWidth={Math.max(PLAN_LINE, WALL_THICKNESS_M * ppm)}
                                strokeLinecap="butt"
                              />
                            ) : null
                          )}
                          {mapPartitionCorners.map((c, i) => {
                            if (!c) return null;
                            const t = Math.max(PLAN_LINE, WALL_THICKNESS_M * ppm);
                            return (
                              <rect
                                key={`map-iwc-${i}`}
                                x={c.x - t / 2}
                                y={c.y - t / 2}
                                width={t}
                                height={t}
                                fill={WALL_FILL}
                              />
                            );
                          })}
                        </>
                      ) : (
                        <polyline
                          points={displayPoly.map((p) => `${p.x},${p.y}`).join(" ")}
                          fill="none"
                          stroke={shapeStroke}
                          strokeWidth={PLAN_LINE}
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
                        strokeWidth={PLAN_LINE_HOVER}
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
                  {polyClosed && mapLivingPt ? (
                    <RoomDimLabel
                      x={mapLivingPt.x}
                      y={mapLivingPt.y}
                      title="Living"
                      subtitle={
                        mapLivingDims ? formatRoomMetres(mapLivingDims.w, mapLivingDims.h) : null
                      }
                    />
                  ) : polyClosed && displayPoly.length >= 3 && polyAreaM2 > 0 ? (
                    <AreaLabel
                      x={polyCenter.x}
                      y={polyCenter.y}
                      areaM2={polyAreaM2}
                      compact={polyAreaM2 < 4}
                    />
                  ) : null}
                  {mapRoomPolys.map(({ room, pts }) => {
                    if (pts.length < 3) return null;
                    const c = polygonCentroidPx(pts);
                    return (
                      <RoomDimLabel
                        key={`${room.id}-map-label`}
                        x={c.x}
                        y={c.y}
                        title={roomKindLabel(roomKind(room))}
                        subtitle={formatRoomMetres(room.w, room.h)}
                      />
                    );
                  })}
                  {polySideLabels.map((side) => (
                    <EdgeDimLabel
                      key={side.key}
                      x={side.x}
                      y={side.y}
                      text={side.label}
                      angleDeg={side.angleDeg}
                      color={WHITE}
                    />
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
          frame={design.frame}
          rooms={designRooms}
          onRoomsChange={setDesignRooms}
          nextIdRef={bedroomIdRef}
          onBuildingChange={applyDesignBuilding}
          viewScale={designScaleRef.current}
          onViewScaleChange={onDesignViewScale}
          maxArea={maxArea}
          onMaxAreaChange={setMaxArea}
          address={projectSiteAddress(quotePick, quoteGroups, resultLabel, query)}
          quoteEmail={quoteContact.email}
          quoteFirstName={quoteContact.firstName}
          onClose={closeDesign}
        />
      ) : null}
    </div>
  );
}

export {
  WALL_THICKNESS_M,
  bedroomBathroomInternalWalls,
  buildDesignExportCanvas,
  collectDesignDoors,
  formatSqm,
  insetPolygon,
  layoutFitWithDims,
  roomsWithPorchSteps,
};
