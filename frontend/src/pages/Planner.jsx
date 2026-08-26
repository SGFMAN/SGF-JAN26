import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import ToolsSidebarMenu from "../components/ToolsSidebarMenu";
import useAppLogo from "../hooks/useAppLogo.js";
import startBuildingImage from "../images/start building.png";
import {
  PLANNER_BOARD_HEIGHT,
  PLANNER_BOARD_WIDTH,
  PLANNER_FLOW_ITEMS,
  PLANNER_SNAP_SIZE,
  PLANNER_START_BUILDING_KEY,
  clampPlannerPoint,
  clampPlannerPositions,
  defaultPlannerPositions,
  fetchPlannerLayoutFromApi,
  loadPlannerLayout,
  persistPlannerLayoutToApi,
  plannerLayoutShouldSeedServer,
  plannerNodeSize,
  savePlannerLayout,
} from "../utils/plannerLayout.js";
import { UI } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;

const LINK_HOVER = "#D32F2F";

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
  "#E8D5B7",
  "#D7E3FC",
];

function defaultPositions() {
  return defaultPlannerPositions();
}

function loadLayout() {
  return loadPlannerLayout(defaultPositions());
}

function saveLayout(positions, links) {
  savePlannerLayout(positions, links);
}

function rectCenter(point, key) {
  const size = plannerNodeSize(key);
  return {
    x: (point?.x || 0) + size.width / 2,
    y: (point?.y || 0) + size.height / 2,
  };
}

function boxEdgeToward(center, other, size) {
  const dx = other.x - center.x;
  const dy = other.y - center.y;
  if (dx === 0 && dy === 0) return center;
  const t = Math.min(
    dx === 0 ? Infinity : size.width / 2 / Math.abs(dx),
    dy === 0 ? Infinity : size.height / 2 / Math.abs(dy)
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
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const saved = useMemo(() => loadLayout(), []);
  const [positions, setPositions] = useState(() => clampPlannerPositions(saved.positions));
  const [links, setLinks] = useState(saved.links);
  const [draggingKey, setDraggingKey] = useState(null);
  const [linking, setLinking] = useState(false);
  const [linkSourceKey, setLinkSourceKey] = useState(null);
  const [hoveredLinkId, setHoveredLinkId] = useState(null);
  const [analyseOpen, setAnalyseOpen] = useState(false);
  const [boardScale, setBoardScale] = useState(1);
  const boardScaleRef = useRef(1);
  const nextLinkIdRef = useRef(saved.links.length + 1);
  const canPersistRef = useRef(false);
  const positionsRef = useRef(saved.positions);
  const linksRef = useRef(saved.links);
  positionsRef.current = positions;
  linksRef.current = links;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const defaults = defaultPositions();
      const remote = await fetchPlannerLayoutFromApi(defaults);
      if (cancelled) return;
      if (remote) {
        setPositions(clampPlannerPositions(remote.positions));
        setLinks(remote.links);
        nextLinkIdRef.current = remote.links.length + 1;
        savePlannerLayout(clampPlannerPositions(remote.positions), remote.links);
      } else {
        const local = loadPlannerLayout(defaults);
        if (plannerLayoutShouldSeedServer(local, defaults)) {
          persistPlannerLayoutToApi(local.positions, local.links).catch(() => {});
        }
      }
      canPersistRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    savePlannerLayout(positions, links);
    if (!canPersistRef.current) return undefined;
    const timer = setTimeout(() => {
      persistPlannerLayoutToApi(positions, links).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [positions, links]);

  useEffect(() => {
    return () => {
      if (!canPersistRef.current) return;
      persistPlannerLayoutToApi(positionsRef.current, linksRef.current).catch(() => {});
    };
  }, []);

  const cancelLinking = useCallback(() => {
    setLinking(false);
    setLinkSourceKey(null);
  }, []);

  const onPointerMove = useCallback((event) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;
    const scale = boardScaleRef.current || 1;
    const rect = canvas.getBoundingClientRect();
    const nextX = Math.max(0, (event.clientX - rect.left) / scale - drag.offsetX);
    const nextY = Math.max(0, (event.clientY - rect.top) / scale - drag.offsetY);
    setPositions((prev) => ({
      ...prev,
      [drag.key]: clampPlannerPoint({ x: nextX, y: nextY }, drag.key),
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

  useEffect(() => {
    if (!analyseOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setAnalyseOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [analyseOpen]);

  function startDrag(event, key) {
    if (linking) return;
    if (event.button != null && event.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = boardScaleRef.current || 1;
    const rect = canvas.getBoundingClientRect();
    const current = positions[key] || { x: 0, y: 0 };
    dragRef.current = {
      key,
      offsetX: (event.clientX - rect.left) / scale - current.x,
      offsetY: (event.clientY - rect.top) / scale - current.y,
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

  const boardExtent = { width: PLANNER_BOARD_WIDTH, height: PLANNER_BOARD_HEIGHT };

  boardScaleRef.current = boardScale;

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return undefined;
    const update = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      if (width < 1 || height < 1 || boardExtent.width < 1 || boardExtent.height < 1) return;
      const pad = 8;
      const next = Math.min(1, (width - pad) / boardExtent.width, (height - pad) / boardExtent.height);
      setBoardScale(Number.isFinite(next) && next > 0.01 ? next : 1);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [boardExtent.height, boardExtent.width]);

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
        const fromSize = plannerNodeSize(link.from);
        const toSize = plannerNodeSize(link.to);
        const from = rectCenter(positions[link.from], link.from);
        const to = rectCenter(positions[link.to], link.to);
        const total = group.length;
        if (link.from === link.to) {
          const loop = 36 + index * 14;
          drawn.push({
            id: link.id,
            self: true,
            d: `M ${from.x + fromSize.width / 2} ${from.y - 10} C ${from.x + fromSize.width / 2 + loop} ${from.y - 28 - index * 8}, ${from.x + fromSize.width / 2 + loop} ${from.y + 28 + index * 8}, ${from.x + fromSize.width / 2} ${from.y + 10}`,
          });
          return;
        }
        const start = boxEdgeToward(from, to, fromSize);
        const end = boxEdgeToward(to, from, toSize);
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

  const analysisRows = useMemo(() => {
    const labels = Object.fromEntries(PLANNER_FLOW_ITEMS.map((item) => [item.key, item.label]));
    return PLANNER_FLOW_ITEMS.map((item) => {
      const dependsOn = [];
      const seen = new Set();
      for (const link of links) {
        if (link.to !== item.key) continue;
        if (seen.has(link.from)) continue;
        seen.add(link.from);
        dependsOn.push(labels[link.from] || link.from);
      }
      return {
        key: item.key,
        label: item.label,
        dependsOn,
      };
    });
  }, [links]);

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
              onClick={() => {
                cancelLinking();
                setAnalyseOpen(true);
              }}
              style={toolbarButtonStyle(false)}
            >
              Analyse
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
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              userSelect: draggingKey || linking ? "none" : "auto",
            }}
          >
            <div
              ref={canvasRef}
              style={{
                width: boardExtent.width * boardScale,
                height: boardExtent.height * boardScale,
                flexShrink: 0,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: boardExtent.width,
                  height: boardExtent.height,
                  transform: `scale(${boardScale})`,
                  transformOrigin: "top left",
                backgroundColor: WHITE,
                backgroundImage: [
                  `linear-gradient(to right, rgba(50, 50, 51, 0.22) 1px, transparent 1px)`,
                  `linear-gradient(to bottom, rgba(50, 50, 51, 0.22) 1px, transparent 1px)`,
                  `linear-gradient(to right, rgba(50, 50, 51, 0.10) 1px, transparent 1px)`,
                  `linear-gradient(to bottom, rgba(50, 50, 51, 0.10) 1px, transparent 1px)`,
                ].join(", "),
                backgroundSize: `${PLANNER_SNAP_SIZE * 5}px ${PLANNER_SNAP_SIZE * 5}px, ${PLANNER_SNAP_SIZE * 5}px ${PLANNER_SNAP_SIZE * 5}px, ${PLANNER_SNAP_SIZE}px ${PLANNER_SNAP_SIZE}px, ${PLANNER_SNAP_SIZE}px ${PLANNER_SNAP_SIZE}px`,
                backgroundPosition: "0 0",
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

              {PLANNER_FLOW_ITEMS.map((item, index) => {
                const point = positions[item.key] || { x: 0, y: 0 };
                const size = plannerNodeSize(item.key);
                const color = PASTEL_COLORS[index % PASTEL_COLORS.length];
                const isDragging = draggingKey === item.key;
                const isLinkSource = linkSourceKey === item.key;
                const isStartBuilding = item.key === PLANNER_START_BUILDING_KEY;
                return (
                  <div
                    key={item.key}
                    onPointerDown={(event) => startDrag(event, item.key)}
                    onClick={(event) => handleRectClick(event, item.key)}
                    style={{
                      position: "absolute",
                      left: point.x,
                      top: point.y,
                      width: size.width,
                      height: size.height,
                      boxSizing: "border-box",
                      background: isStartBuilding ? "transparent" : color,
                      border: isLinkSource
                        ? `3px solid ${MONUMENT}`
                        : isStartBuilding
                          ? "none"
                          : `1px solid ${UI.outline}`,
                      borderRadius: isStartBuilding ? 0 : "10px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: isStartBuilding ? 0 : "8px 10px",
                      textAlign: "center",
                      fontSize: "0.95rem",
                      fontWeight: item.kind === "heading" ? 700 : 600,
                      color: MONUMENT,
                      cursor: linking ? "pointer" : isDragging ? "grabbing" : "grab",
                      boxShadow: isLinkSource
                        ? "0 0 0 3px rgba(50,50,51,0.18)"
                        : isDragging
                          ? "0 8px 20px rgba(0,0,0,0.18)"
                          : isStartBuilding
                            ? "none"
                            : "0 2px 8px rgba(0,0,0,0.08)",
                      zIndex: isDragging || isLinkSource ? 20 : 1,
                      touchAction: "none",
                    }}
                  >
                    {isStartBuilding ? (
                      <img
                        src={startBuildingImage}
                        alt="Start Building"
                        draggable={false}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "fill",
                          display: "block",
                          pointerEvents: "none",
                        }}
                      />
                    ) : (
                      item.label
                    )}
                  </div>
                );
              })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {analyseOpen ? (
        <div
          onClick={() => setAnalyseOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            padding: "20px",
            boxSizing: "border-box",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="planner-analyse-title"
            onClick={(event) => event.stopPropagation()}
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "24px",
              width: "100%",
              maxWidth: "640px",
              maxHeight: "90vh",
              overflow: "auto",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
              position: "relative",
              boxSizing: "border-box",
              color: MONUMENT,
            }}
          >
            <button
              type="button"
              onClick={() => setAnalyseOpen(false)}
              aria-label="Close"
              style={{
                position: "absolute",
                top: "12px",
                right: "12px",
                background: "transparent",
                border: "none",
                fontSize: "1.5rem",
                cursor: "pointer",
                color: MONUMENT,
                width: "40px",
                height: "40px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "4px",
              }}
            >
              ×
            </button>
            <h2
              id="planner-analyse-title"
              style={{ margin: "0 40px 16px 0", fontSize: "1.45rem", fontWeight: 700, color: MONUMENT }}
            >
              Analyse
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", color: MONUMENT }}>
              {analysisRows.map((row) => (
                <div key={row.key}>
                  <div style={{ fontWeight: 700, marginBottom: "2px" }}>{row.label}</div>
                  <div style={{ fontSize: "0.95rem", lineHeight: 1.4 }}>
                    {row.dependsOn.length
                      ? `Depends on: ${row.dependsOn.join(", ")}`
                      : "Depends on: none"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
