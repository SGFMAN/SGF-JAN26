import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import ToolsSidebarMenu from "../components/ToolsSidebarMenu";
import useAppLogo from "../hooks/useAppLogo.js";
import { OVERVIEW_STATUS_HEADINGS } from "../utils/designPhaseStatusTiles.js";
import { UI } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;

const STORAGE_KEY = "sgf-planner-layout-v1";
const LINK_HOVER = "#D32F2F";
const RECT_WIDTH = 188;
const RECT_HEIGHT = 72;
const GRID_COLS = 4;
const GRID_GAP_X = 16;
const GRID_GAP_Y = 16;
const GRID_ORIGIN = 16;
const VALID_KEYS = new Set(OVERVIEW_STATUS_HEADINGS.map((item) => item.key));

const PASTEL_COLORS = [
  "#F8C8DC",
  "#FFD8A8",
  "#FFF3B0",
  "#D8F3DC",
  "#BDE0FE",
  "#CDB4DB",
  "#FAD2E1",
  "#CDEAC0",
  "#FFE5B4",
  "#B8E0D2",
  "#E2CFEA",
  "#FDE2E4",
  "#D4E6F1",
  "#F9E2AE",
];

function defaultPositions() {
  const positions = {};
  OVERVIEW_STATUS_HEADINGS.forEach((item, index) => {
    const col = index % GRID_COLS;
    const row = Math.floor(index / GRID_COLS);
    positions[item.key] = {
      x: GRID_ORIGIN + col * (RECT_WIDTH + GRID_GAP_X),
      y: GRID_ORIGIN + row * (RECT_HEIGHT + GRID_GAP_Y),
    };
  });
  return positions;
}

function loadLayout() {
  const defaults = defaultPositions();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { positions: defaults, links: [] };
    const parsed = JSON.parse(raw);
    const saved = parsed?.positions && typeof parsed.positions === "object" ? parsed.positions : {};
    const positions = { ...defaults };
    for (const item of OVERVIEW_STATUS_HEADINGS) {
      const point = saved[item.key];
      if (point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))) {
        positions[item.key] = { x: Number(point.x), y: Number(point.y) };
      }
    }
    const links = Array.isArray(parsed?.links)
      ? parsed.links
          .filter(
            (link) =>
              link &&
              VALID_KEYS.has(link.from) &&
              VALID_KEYS.has(link.to)
          )
          .map((link, index) => ({
            id: String(link.id || `link-${index}`),
            from: link.from,
            to: link.to,
          }))
      : [];
    return { positions, links };
  } catch {
    return { positions: defaults, links: [] };
  }
}

function saveLayout(positions, links) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ positions, links }));
  } catch {
    // ignore quota / private mode
  }
}

function rectCenter(point) {
  return {
    x: (point?.x || 0) + RECT_WIDTH / 2,
    y: (point?.y || 0) + RECT_HEIGHT / 2,
  };
}

function boxEdgeToward(center, other) {
  const dx = other.x - center.x;
  const dy = other.y - center.y;
  if (dx === 0 && dy === 0) return center;
  const t = Math.min(
    dx === 0 ? Infinity : RECT_WIDTH / 2 / Math.abs(dx),
    dy === 0 ? Infinity : RECT_HEIGHT / 2 / Math.abs(dy)
  );
  return {
    x: center.x + dx * t,
    y: center.y + dy * t,
  };
}

function toolbarButtonStyle(active = false) {
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

export default function Planner() {
  const logo = useAppLogo();
  const boardRef = useRef(null);
  const dragRef = useRef(null);
  const saved = useMemo(() => loadLayout(), []);
  const [positions, setPositions] = useState(saved.positions);
  const [links, setLinks] = useState(saved.links);
  const [draggingKey, setDraggingKey] = useState(null);
  const [linking, setLinking] = useState(false);
  const [linkSourceKey, setLinkSourceKey] = useState(null);
  const [hoveredLinkId, setHoveredLinkId] = useState(null);
  const nextLinkIdRef = useRef(saved.links.length + 1);

  useEffect(() => {
    saveLayout(positions, links);
  }, [positions, links]);

  const cancelLinking = useCallback(() => {
    setLinking(false);
    setLinkSourceKey(null);
  }, []);

  const onPointerMove = useCallback((event) => {
    const drag = dragRef.current;
    const board = boardRef.current;
    if (!drag || !board) return;
    const rect = board.getBoundingClientRect();
    const nextX = Math.max(0, event.clientX - rect.left + board.scrollLeft - drag.offsetX);
    const nextY = Math.max(0, event.clientY - rect.top + board.scrollTop - drag.offsetY);
    setPositions((prev) => ({
      ...prev,
      [drag.key]: { x: nextX, y: nextY },
    }));
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDraggingKey(null);
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [endDrag, onPointerMove]);

  useEffect(() => {
    if (!linking) return undefined;
    const onContextMenu = (event) => {
      event.preventDefault();
      cancelLinking();
    };
    window.addEventListener("contextmenu", onContextMenu);
    return () => window.removeEventListener("contextmenu", onContextMenu);
  }, [cancelLinking, linking]);

  function startDrag(event, key) {
    if (linking) return;
    if (event.button != null && event.button !== 0) return;
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const current = positions[key] || { x: 0, y: 0 };
    dragRef.current = {
      key,
      offsetX: event.clientX - rect.left + board.scrollLeft - current.x,
      offsetY: event.clientY - rect.top + board.scrollTop - current.y,
    };
    setDraggingKey(key);
    event.preventDefault();
  }

  function handleRectClick(event, key) {
    if (!linking) return;
    event.preventDefault();
    event.stopPropagation();
    if (!linkSourceKey) {
      setLinkSourceKey(key);
      return;
    }
    const id = `link-${nextLinkIdRef.current}`;
    nextLinkIdRef.current += 1;
    setLinks((prev) => [...prev, { id, from: linkSourceKey, to: key }]);
    setLinkSourceKey(null);
  }

  const boardExtent = OVERVIEW_STATUS_HEADINGS.reduce(
    (extent, item) => {
      const point = positions[item.key] || { x: 0, y: 0 };
      return {
        width: Math.max(extent.width, point.x + RECT_WIDTH + GRID_ORIGIN + 80),
        height: Math.max(extent.height, point.y + RECT_HEIGHT + GRID_ORIGIN + 80),
      };
    },
    { width: 0, height: 0 }
  );

  const drawnLinks = useMemo(() => {
    const grouped = new Map();
    for (const link of links) {
      const pair = `${link.from}=>${link.to}`;
      if (!grouped.has(pair)) grouped.set(pair, []);
      grouped.get(pair).push(link);
    }
    const drawn = [];
    for (const group of grouped.values()) {
      group.forEach((link, index) => {
        const from = rectCenter(positions[link.from]);
        const to = rectCenter(positions[link.to]);
        const total = group.length;
        if (link.from === link.to) {
          const loop = 36 + index * 14;
          drawn.push({
            id: link.id,
            self: true,
            d: `M ${from.x + RECT_WIDTH / 2} ${from.y - 10} C ${from.x + RECT_WIDTH / 2 + loop} ${from.y - 28 - index * 8}, ${from.x + RECT_WIDTH / 2 + loop} ${from.y + 28 + index * 8}, ${from.x + RECT_WIDTH / 2} ${from.y + 10}`,
          });
          return;
        }
        const start = boxEdgeToward(from, to);
        const end = boxEdgeToward(to, from);
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const offset = (index - (total - 1) / 2) * 10;
        drawn.push({
          id: link.id,
          self: false,
          x1: start.x + nx * offset,
          y1: start.y + ny * offset,
          x2: end.x + nx * offset,
          y2: end.y + ny * offset,
        });
      });
    }
    return drawn;
  }, [links, positions]);

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
        <RouterLink to="/projects" style={{ position: "absolute", left: "40px", cursor: "pointer" }}>
          <img src={logo} alt="SGF Logo" style={{ width: "120px", height: "auto" }} />
        </RouterLink>
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
            Planner
          </h1>
        </div>
      </div>

      <div
        className="sections-container"
        style={{
          display: "flex",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          margin: "50px auto 0 auto",
          gap: "32px",
        }}
      >
        <ToolsSidebarMenu />

        <div
          className="content-section"
          style={{
            background: SECTION_GREY,
            borderRadius: "18px",
            flex: 1,
            minHeight: "758px",
            height: "758px",
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
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => {
                if (linking) {
                  cancelLinking();
                  return;
                }
                setLinking(true);
                setLinkSourceKey(null);
              }}
              style={toolbarButtonStyle(linking)}
            >
              Link
            </button>
            <button
              type="button"
              onClick={() => setLinks([])}
              style={toolbarButtonStyle(false)}
            >
              Reset
            </button>
          </div>

          <div
            ref={boardRef}
            style={{
              position: "relative",
              flex: 1,
              minHeight: 0,
              background: WHITE,
              borderRadius: "12px",
              overflow: "auto",
              userSelect: draggingKey || linking ? "none" : "auto",
            }}
          >
            <div
              style={{
                position: "relative",
                width: boardExtent.width,
                minWidth: "100%",
                height: boardExtent.height,
                minHeight: "100%",
              }}
            >
              <svg
                width={boardExtent.width}
                height={boardExtent.height}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  overflow: "visible",
                  pointerEvents: "none",
                  zIndex: 5,
                }}
              >
                <defs>
                  <marker
                    id="planner-arrow"
                    markerWidth="10"
                    markerHeight="8"
                    refX="9"
                    refY="4"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M 0 0 L 10 4 L 0 8 z" fill={MONUMENT} />
                  </marker>
                  <marker
                    id="planner-arrow-hover"
                    markerWidth="10"
                    markerHeight="8"
                    refX="9"
                    refY="4"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M 0 0 L 10 4 L 0 8 z" fill={LINK_HOVER} />
                  </marker>
                </defs>
                {drawnLinks.map((link) => {
                  const hovered = hoveredLinkId === link.id;
                  const stroke = hovered ? LINK_HOVER : MONUMENT;
                  const marker = hovered ? "url(#planner-arrow-hover)" : "url(#planner-arrow)";
                  const interactive = !linking && !draggingKey;
                  return (
                    <g
                      key={link.id}
                      onPointerEnter={() => {
                        if (!interactive) return;
                        setHoveredLinkId(link.id);
                      }}
                      onPointerLeave={() => {
                        setHoveredLinkId((current) => (current === link.id ? null : current));
                      }}
                      onClick={(event) => {
                        if (!interactive || hoveredLinkId !== link.id) return;
                        event.stopPropagation();
                        setLinks((prev) => prev.filter((item) => item.id !== link.id));
                        setHoveredLinkId(null);
                      }}
                      style={{
                        pointerEvents: interactive ? "stroke" : "none",
                        cursor: interactive ? "pointer" : "default",
                      }}
                    >
                      {link.self ? (
                        <>
                          <path d={link.d} fill="none" stroke="transparent" strokeWidth="16" />
                          <path
                            d={link.d}
                            fill="none"
                            stroke={stroke}
                            strokeWidth={hovered ? 3 : 2}
                            markerEnd={marker}
                          />
                        </>
                      ) : (
                        <>
                          <line
                            x1={link.x1}
                            y1={link.y1}
                            x2={link.x2}
                            y2={link.y2}
                            stroke="transparent"
                            strokeWidth="16"
                          />
                          <line
                            x1={link.x1}
                            y1={link.y1}
                            x2={link.x2}
                            y2={link.y2}
                            stroke={stroke}
                            strokeWidth={hovered ? 3 : 2}
                            markerEnd={marker}
                          />
                        </>
                      )}
                    </g>
                  );
                })}
              </svg>

              {OVERVIEW_STATUS_HEADINGS.map((item, index) => {
                const point = positions[item.key] || { x: 0, y: 0 };
                const color = PASTEL_COLORS[index % PASTEL_COLORS.length];
                const isDragging = draggingKey === item.key;
                const isLinkSource = linkSourceKey === item.key;
                return (
                  <div
                    key={item.key}
                    onPointerDown={(event) => startDrag(event, item.key)}
                    onClick={(event) => handleRectClick(event, item.key)}
                    style={{
                      position: "absolute",
                      left: point.x,
                      top: point.y,
                      width: RECT_WIDTH,
                      height: RECT_HEIGHT,
                      boxSizing: "border-box",
                      background: color,
                      border: isLinkSource ? `3px solid ${MONUMENT}` : `1px solid ${UI.outline}`,
                      borderRadius: "10px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "8px 10px",
                      textAlign: "center",
                      fontSize: "0.95rem",
                      fontWeight: 600,
                      color: MONUMENT,
                      cursor: linking ? "pointer" : isDragging ? "grabbing" : "grab",
                      boxShadow: isLinkSource
                        ? "0 0 0 3px rgba(50,50,51,0.18)"
                        : isDragging
                          ? "0 8px 20px rgba(0,0,0,0.18)"
                          : "0 2px 8px rgba(0,0,0,0.08)",
                      zIndex: isDragging || isLinkSource ? 20 : 1,
                      touchAction: "none",
                    }}
                  >
                    {item.label}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
