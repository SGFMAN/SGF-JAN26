import React, { useEffect, useRef, useState } from "react";
import {
  clamp,
  drawCubePreview,
  drawFrontArrow,
  projectShapePoint,
  rotateShapeXY,
  shapeHitDepth,
  taperAmountOf,
  taperPosOf,
} from "../utils/sandpitCarMesh";

function newCube() {
  return {
    id: `cube-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    type: "cube",
    l: 80,
    w: 40,
    h: 30,
    taperHA: 0,
    taperHB: 0,
    taperVA: 0,
    taperVB: 0,
    taperHPos: 0.5,
    taperVPos: 0.5,
    x: 0,
    y: 0,
    z: 0,
    groundSnap: true,
    rx: 0,
    ry: 0,
    rz: 0,
  };
}

function newCylinder() {
  return {
    id: `cyl-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    type: "cylinder",
    l: 80,
    r: 18,
    x: 0,
    y: 0,
    z: 0,
    groundSnap: true,
    rx: 0,
    ry: 0,
    rz: 0,
  };
}

function shapeListLabel(shapes, index) {
  const shape = shapes[index];
  const kind = shape.type === "cylinder" ? "Cylinder" : "Cube";
  const n = shapes.slice(0, index + 1).filter((item) => item.type === shape.type).length;
  return `${kind} ${n}`;
}

function nextShapeX(prev) {
  const last = prev[prev.length - 1];
  return last ? (Number(last.x) || 0) + 90 : 0;
}

const overlayStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 20000,
  background: "rgba(4, 10, 24, 0.72)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const modalStyle = {
  width: "min(1680px, calc(100% - 24px))",
  height: "min(780px, calc(100% - 24px))",
  background: "#d8d8dc",
  borderRadius: 12,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
};

const fieldStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: "0.8rem",
  color: "#323233",
};

const inputStyle = {
  height: 32,
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  padding: "0 6px",
  borderRadius: 6,
  border: "1px solid #b4b4b8",
  background: "#fff",
};

const sliderRowStyle = {
  display: "grid",
  gridTemplateColumns: "58px minmax(120px, 1fr) 64px",
  gap: 8,
  alignItems: "center",
};

const sliderRowWithSnapStyle = {
  ...sliderRowStyle,
  gridTemplateColumns: "58px minmax(120px, 1fr) 64px 40px",
};

const PREVIEW_SCALE = 1.7;

function PercentSlider({ label, name, value, onChange, min = 0, max = 95, snap = null, snapRange = 8 }) {
  const pct = Math.round(clamp(value, min / 100, max / 100) * 100);
  const aria = name || label;
  const snapPct = snap != null ? Math.round(snap * 100) : null;
  const snapped = snapPct != null;
  return (
    <div style={snapped ? sliderRowWithSnapStyle : sliderRowStyle}>
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={pct}
        aria-label={aria}
        onChange={(e) => {
          let next = Number(e.target.value);
          if (snapped && Math.abs(next - snapPct) <= snapRange) next = snapPct;
          onChange(next / 100);
        }}
      />
      <input
        type="number"
        min={min}
        max={max}
        value={pct}
        aria-label={`${aria} value`}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        style={inputStyle}
      />
      {snapped ? (
        <button
          type="button"
          onClick={() => onChange(snap)}
          aria-label={`${aria} snap to middle`}
          style={{
            height: 32,
            padding: 0,
            borderRadius: 6,
            border: pct === snapPct ? "1px solid #323233" : "1px solid #b4b4b8",
            background: pct === snapPct ? "#fff" : "#e4e4e8",
            fontWeight: 600,
            fontSize: "0.7rem",
            cursor: "pointer",
          }}
        >
          Mid
        </button>
      ) : null}
    </div>
  );
}

function NumberSlider({
  label,
  name,
  value,
  onChange,
  min,
  max,
  step = 1,
  snap = null,
  snapRange = 10,
  snapLabel = "Mid",
  snapLock = false,
  onSnapLock,
}) {
  const v = clamp(Number(value) || 0, min, max);
  const aria = name || label;
  const snapped = snap != null;
  const locked = Boolean(snapLock);
  const active = locked || (!onSnapLock && v === snap);
  return (
    <div style={snapped ? sliderRowWithSnapStyle : sliderRowStyle}>
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={locked ? snap : v}
        aria-label={aria}
        onChange={(e) => {
          let next = Number(e.target.value);
          if (snapped && Math.abs(next - snap) <= snapRange) next = snap;
          if (locked && onSnapLock && next !== snap) onSnapLock(false);
          onChange(next);
        }}
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={locked ? snap : v}
        aria-label={`${aria} value`}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (locked && onSnapLock && next !== snap) onSnapLock(false);
          onChange(next);
        }}
        style={inputStyle}
      />
      {snapped ? (
        <button
          type="button"
          onClick={() => {
            if (onSnapLock) {
              if (locked) onSnapLock(false);
              else {
                onChange(snap);
                onSnapLock(true);
              }
            } else {
              onChange(snap);
            }
          }}
          aria-label={onSnapLock ? `${aria} snap to ground` : `${aria} snap to middle`}
          aria-pressed={onSnapLock ? locked : undefined}
          style={{
            height: 32,
            padding: 0,
            borderRadius: 6,
            border: active ? "1px solid #323233" : "1px solid #b4b4b8",
            background: active ? "#fff" : "#e4e4e8",
            fontWeight: 600,
            fontSize: "0.7rem",
            cursor: "pointer",
          }}
        >
          {snapLabel}
        </button>
      ) : null}
    </div>
  );
}

export default function SandpitDesigner({ initialShapes = [], onClose }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const dragRef = useRef(null);
  const [shapes, setShapes] = useState(() => (Array.isArray(initialShapes) ? initialShapes : []));
  const [selectedId, setSelectedId] = useState(null);
  const [heading, setHeading] = useState(-0.7);
  const selected = shapes.find((shape) => shape.id === selectedId) || null;
  const shapesRef = useRef(shapes);
  shapesRef.current = shapes;

  function closeAndSave() {
    onClose(shapesRef.current);
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") closeAndSave();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;

    function draw() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { clientWidth: cw, clientHeight: ch } = wrap;
      canvas.width = Math.max(1, Math.round(cw * dpr));
      canvas.height = Math.max(1, Math.round(ch * dpr));
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      ctx.fillStyle = "#8aa56a";
      ctx.fillRect(0, 0, cw, ch);
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      for (let x = 20; x < cw; x += 28) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, ch);
        ctx.stroke();
      }
      for (let y = 20; y < ch; y += 28) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(cw, y);
        ctx.stroke();
      }
      const ox = cw / 2;
      const oy = ch * 0.62;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(PREVIEW_SCALE, PREVIEW_SCALE);
      const ground = [
        projectShapePoint(-240, -180, 0, heading),
        projectShapePoint(240, -180, 0, heading),
        projectShapePoint(240, 180, 0, heading),
        projectShapePoint(-240, 180, 0, heading),
      ];
      ctx.beginPath();
      ctx.moveTo(ground[0].x, ground[0].y);
      ground.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = "rgba(92, 112, 64, 0.55)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      for (let gx = -200; gx <= 200; gx += 40) {
        const a = projectShapePoint(gx, -180, 0, heading);
        const b = projectShapePoint(gx, 180, 0, heading);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      for (let gy = -160; gy <= 160; gy += 40) {
        const a = projectShapePoint(-240, gy, 0, heading);
        const b = projectShapePoint(240, gy, 0, heading);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      const ordered = shapes.slice().sort((a, b) => {
        const da = rotateShapeXY(Number(a.x) || 0, Number(a.y) || 0, heading).y;
        const db = rotateShapeXY(Number(b.x) || 0, Number(b.y) || 0, heading).y;
        return da - db;
      });
      ordered.forEach((shape) => {
        const sx = projectShapePoint(Number(shape.x) || 0, Number(shape.y) || 0, 0, heading).x;
        const sy = projectShapePoint(Number(shape.x) || 0, Number(shape.y) || 0, 0, heading).y;
        ctx.fillStyle = "rgba(0,0,0,0.16)";
        ctx.beginPath();
        ctx.ellipse(sx + 8, sy + 16, 54, 16, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      ordered.forEach((shape) => {
        drawCubePreview(ctx, shape, heading, 0, 0, {
          selected: shape.id === selectedId,
          showLabels: shape.id === selectedId,
        });
      });
      drawFrontArrow(ctx, heading, shapes);
      ctx.restore();
    }

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [shapes, selectedId, heading]);

  function addCube() {
    const cube = newCube();
    setShapes((prev) => [...prev, { ...cube, x: nextShapeX(prev) }]);
    setSelectedId(cube.id);
  }

  function addCylinder() {
    const cyl = newCylinder();
    setShapes((prev) => [...prev, { ...cyl, x: nextShapeX(prev) }]);
    setSelectedId(cyl.id);
  }

  function updateSelected(patch) {
    if (!selectedId) return;
    setShapes((prev) => prev.map((shape) => (shape.id === selectedId ? { ...shape, ...patch } : shape)));
  }

  function onPreviewDown(e) {
    dragRef.current = { x: e.clientX, y: e.clientY, heading, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPreviewMove(e) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
    if (dragRef.current.moved) setHeading(dragRef.current.heading + dx * 0.01);
  }

  function onPreviewUp(e) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.moved) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const ox = rect.width / 2;
    const oy = rect.height * 0.62;
    const px = (e.clientX - rect.left - ox) / PREVIEW_SCALE;
    const py = (e.clientY - rect.top - oy) / PREVIEW_SCALE;
    let best = null;
    shapes.forEach((shape) => {
      const depth = shapeHitDepth(shape, heading, px, py);
      if (depth == null) return;
      if (!best || depth > best.depth) best = { id: shape.id, depth };
    });
    setSelectedId(best ? best.id : null);
  }

  return (
    <div
      style={overlayStyle}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div style={modalStyle} role="dialog" aria-label="Designer">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            background: "#323233",
            color: "#fff",
          }}
        >
          <strong>Designer</strong>
          <button
            type="button"
            onClick={closeAndSave}
            style={{
              background: "transparent",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.4)",
              borderRadius: 8,
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "220px minmax(0, 1fr) 460px" }}>
          <div
            style={{
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              borderRight: "1px solid #b4b4b8",
              background: "#ececf0",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setShapes([]);
                setSelectedId(null);
              }}
              aria-label="Clear model"
              style={{
                height: 36,
                borderRadius: 8,
                border: "1px solid #8a8a90",
                background: "#fff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={addCube}
              style={{
                height: 36,
                borderRadius: 8,
                border: "1px solid #8a8a90",
                background: "#fff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Add cube
            </button>
            <button
              type="button"
              onClick={addCylinder}
              style={{
                height: 36,
                borderRadius: 8,
                border: "1px solid #8a8a90",
                background: "#fff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Add cylinder
            </button>
            <div style={{ fontSize: "0.75rem", color: "#5a5a60" }}>Shapes</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, overflow: "auto" }}>
              {shapes.length === 0 ? (
                <div style={{ fontSize: "0.8rem", color: "#6a6a70" }}>No shapes yet.</div>
              ) : (
                shapes.map((shape, index) => (
                  <button
                    key={shape.id}
                    type="button"
                    onClick={() => setSelectedId(shape.id)}
                    style={{
                      textAlign: "left",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: shape.id === selectedId ? "2px solid #1ec95a" : "1px solid #c8c8cc",
                      background: shape.id === selectedId ? "#fff" : "#e4e4e8",
                      cursor: "pointer",
                    }}
                  >
                    {shapeListLabel(shapes, index)}
                  </button>
                ))
              )}
            </div>
          </div>

          <div
            ref={wrapRef}
            style={{ minWidth: 0, minHeight: 0, position: "relative", cursor: "grab" }}
            onPointerDown={onPreviewDown}
            onPointerMove={onPreviewMove}
            onPointerUp={onPreviewUp}
          >
            <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, display: "block" }} />
            <div
              style={{
                position: "absolute",
                left: 12,
                bottom: 12,
                fontSize: "0.75rem",
                color: "rgba(255,255,255,0.9)",
                textShadow: "0 1px 2px rgba(0,0,0,0.6)",
                pointerEvents: "none",
              }}
            >
              Drag to rotate · Click a shape to select
            </div>
          </div>

          <div
            style={{
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 14,
              borderLeft: "1px solid #b4b4b8",
              background: "#ececf0",
              overflow: "auto",
            }}
          >
            <div style={{ fontWeight: 700, color: "#323233" }}>
              {selected ? (selected.type === "cylinder" ? "Cylinder" : "Cube") : "Shape"}
            </div>
            {selected ? (
              <>
                <div style={fieldStyle}>
                  Position
                  <NumberSlider
                    label="X"
                    name="Position X"
                    value={selected.x || 0}
                    onChange={(value) => updateSelected({ x: value })}
                    min={-250}
                    max={250}
                  />
                  <NumberSlider
                    label="Y"
                    name="Position Y"
                    value={selected.y || 0}
                    onChange={(value) => updateSelected({ y: value })}
                    min={-250}
                    max={250}
                    snap={0}
                    snapRange={12}
                  />
                  <NumberSlider
                    label="Z"
                    name="Position Z"
                    value={selected.groundSnap ? 0 : selected.z || 0}
                    onChange={(value) => updateSelected({ z: value, groundSnap: false })}
                    min={-100}
                    max={200}
                    snap={0}
                    snapRange={8}
                    snapLabel="Gnd"
                    snapLock={Boolean(selected.groundSnap)}
                    onSnapLock={(locked) => updateSelected({ groundSnap: locked, z: locked ? 0 : selected.z || 0 })}
                  />
                </div>
                <div style={fieldStyle}>
                  Rotate
                  <NumberSlider
                    label="X"
                    name="Rotate X"
                    value={selected.rx || 0}
                    onChange={(value) => updateSelected({ rx: Math.round(value) })}
                    min={-180}
                    max={180}
                    snap={0}
                    snapRange={6}
                  />
                  <NumberSlider
                    label="Y"
                    name="Rotate Y"
                    value={selected.ry || 0}
                    onChange={(value) => updateSelected({ ry: Math.round(value) })}
                    min={-180}
                    max={180}
                    snap={0}
                    snapRange={6}
                  />
                  <NumberSlider
                    label="Z"
                    name="Rotate Z"
                    value={selected.rz || 0}
                    onChange={(value) => updateSelected({ rz: Math.round(value) })}
                    min={-180}
                    max={180}
                    snap={0}
                    snapRange={6}
                  />
                </div>
                {selected.type === "cylinder" ? (
                  <>
                    <div style={fieldStyle}>
                      Length
                      <NumberSlider
                        label="L"
                        name="Length L"
                        value={selected.l}
                        onChange={(value) => updateSelected({ l: value })}
                        min={8}
                        max={200}
                      />
                    </div>
                    <div style={fieldStyle}>
                      Radius
                      <NumberSlider
                        label="R"
                        name="Radius"
                        value={selected.r}
                        onChange={(value) => updateSelected({ r: value })}
                        min={4}
                        max={80}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <label style={fieldStyle}>
                      Length
                      <div style={sliderRowStyle}>
                        <span>L</span>
                        <input
                          type="range"
                          min="8"
                          max="200"
                          value={selected.l}
                          onChange={(e) => updateSelected({ l: Number(e.target.value) })}
                        />
                        <input
                          type="number"
                          min="8"
                          max="200"
                          value={selected.l}
                          onChange={(e) => updateSelected({ l: Number(e.target.value) })}
                          style={inputStyle}
                        />
                      </div>
                    </label>
                    <label style={fieldStyle}>
                      Width
                      <div style={sliderRowStyle}>
                        <span>W</span>
                        <input
                          type="range"
                          min="8"
                          max="200"
                          value={selected.w}
                          onChange={(e) => updateSelected({ w: Number(e.target.value) })}
                        />
                        <input
                          type="number"
                          min="8"
                          max="200"
                          value={selected.w}
                          onChange={(e) => updateSelected({ w: Number(e.target.value) })}
                          style={inputStyle}
                        />
                      </div>
                    </label>
                    <label style={fieldStyle}>
                      Height
                      <div style={sliderRowStyle}>
                        <span>H</span>
                        <input
                          type="range"
                          min="8"
                          max="200"
                          value={selected.h}
                          onChange={(e) => updateSelected({ h: Number(e.target.value) })}
                        />
                        <input
                          type="number"
                          min="8"
                          max="200"
                          value={selected.h}
                          onChange={(e) => updateSelected({ h: Number(e.target.value) })}
                          style={inputStyle}
                        />
                      </div>
                    </label>
                    <div style={fieldStyle}>
                      End taper horizontal
                      <PercentSlider
                        label="End A"
                        name="Horizontal End A"
                        value={taperAmountOf(selected, "h", "a")}
                        onChange={(value) => updateSelected({ taperHA: value })}
                        min={-95}
                        max={95}
                        snap={0}
                      />
                      <PercentSlider
                        label="End B"
                        name="Horizontal End B"
                        value={taperAmountOf(selected, "h", "b")}
                        onChange={(value) => updateSelected({ taperHB: value })}
                        min={-95}
                        max={95}
                        snap={0}
                      />
                      <PercentSlider
                        label="L / R"
                        name="Horizontal left/right"
                        value={taperPosOf(selected, "h")}
                        onChange={(value) => updateSelected({ taperHPos: value })}
                        min={5}
                        max={95}
                        snap={0.5}
                      />
                    </div>
                    <div style={fieldStyle}>
                      End taper vertical
                      <PercentSlider
                        label="End A"
                        name="Vertical End A"
                        value={taperAmountOf(selected, "v", "a")}
                        onChange={(value) => updateSelected({ taperVA: value })}
                        min={-95}
                        max={95}
                        snap={0}
                      />
                      <PercentSlider
                        label="End B"
                        name="Vertical End B"
                        value={taperAmountOf(selected, "v", "b")}
                        onChange={(value) => updateSelected({ taperVB: value })}
                        min={-95}
                        max={95}
                        snap={0}
                      />
                      <PercentSlider
                        label="Dn / Up"
                        name="Vertical bottom/top"
                        value={taperPosOf(selected, "v")}
                        onChange={(value) => updateSelected({ taperVPos: value })}
                        min={5}
                        max={95}
                        snap={0.5}
                      />
                    </div>
                  </>
                )}
              </>
            ) : (
              <div style={{ fontSize: "0.85rem", color: "#6a6a70" }}>Select a shape to edit its specs.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
