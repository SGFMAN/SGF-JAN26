import React, { useEffect, useRef, useState } from "react";
import {
  clamp,
  drawCubePreview,
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
  };
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
  width: "min(1080px, 100%)",
  height: "min(680px, 100%)",
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
  gridTemplateColumns: "52px minmax(0, 1fr) 64px",
  gap: 8,
  alignItems: "center",
};

function PercentSlider({ label, name, value, onChange, min = 0, max = 95 }) {
  const pct = Math.round(clamp(value, min / 100, max / 100) * 100);
  const aria = name || label;
  return (
    <div style={sliderRowStyle}>
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={pct}
        aria-label={aria}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
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
    </div>
  );
}

function NumberSlider({ label, name, value, onChange, min, max, step = 1, snap = null, snapRange = 10 }) {
  const v = clamp(Number(value) || 0, min, max);
  const aria = name || label;
  const snapped = snap != null;
  return (
    <div
      style={
        snapped
          ? { ...sliderRowStyle, gridTemplateColumns: "52px minmax(0, 1fr) 64px 40px" }
          : sliderRowStyle
      }
    >
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        aria-label={aria}
        onChange={(e) => {
          let next = Number(e.target.value);
          if (snapped && Math.abs(next - snap) <= snapRange) next = snap;
          onChange(next);
        }}
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={v}
        aria-label={`${aria} value`}
        onChange={(e) => onChange(Number(e.target.value))}
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
            border: v === snap ? "1px solid #323233" : "1px solid #b4b4b8",
            background: v === snap ? "#fff" : "#e4e4e8",
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
      const ordered = shapes.slice().sort((a, b) => {
        const da = rotateShapeXY(Number(a.x) || 0, Number(a.y) || 0, heading).y;
        const db = rotateShapeXY(Number(b.x) || 0, Number(b.y) || 0, heading).y;
        return da - db;
      });
      ordered.forEach((shape) => {
        const sx = ox + projectShapePoint(Number(shape.x) || 0, Number(shape.y) || 0, 0, heading).x;
        const sy = oy + projectShapePoint(Number(shape.x) || 0, Number(shape.y) || 0, 0, heading).y;
        ctx.fillStyle = "rgba(0,0,0,0.16)";
        ctx.beginPath();
        ctx.ellipse(sx + 8, sy + 16, 54, 16, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      ordered.forEach((shape) => {
        drawCubePreview(ctx, shape, heading, ox, oy, {
          selected: shape.id === selectedId,
          showLabels: shape.id === selectedId,
        });
      });
    }

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [shapes, selectedId, heading]);

  function addCube() {
    const cube = newCube();
    setShapes((prev) => {
      const last = prev[prev.length - 1];
      const placed = { ...cube, x: last ? (Number(last.x) || 0) + 90 : 0 };
      return [...prev, placed];
    });
    setSelectedId(cube.id);
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
    const px = e.clientX - rect.left - ox;
    const py = e.clientY - rect.top - oy;
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

        <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "240px 1fr 280px" }}>
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
                    Cube {index + 1}
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
            <div style={{ fontWeight: 700, color: "#323233" }}>{selected ? "Cube" : "Shape"}</div>
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
                    value={selected.z || 0}
                    onChange={(value) => updateSelected({ z: value })}
                    min={-100}
                    max={200}
                  />
                </div>
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
                  />
                  <PercentSlider
                    label="End B"
                    name="Horizontal End B"
                    value={taperAmountOf(selected, "h", "b")}
                    onChange={(value) => updateSelected({ taperHB: value })}
                    min={-95}
                    max={95}
                  />
                  <PercentSlider
                    label="A / B"
                    name="Horizontal A/B"
                    value={taperPosOf(selected, "h")}
                    onChange={(value) => updateSelected({ taperHPos: value })}
                    min={5}
                    max={95}
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
                  />
                  <PercentSlider
                    label="End B"
                    name="Vertical End B"
                    value={taperAmountOf(selected, "v", "b")}
                    onChange={(value) => updateSelected({ taperVB: value })}
                    min={-95}
                    max={95}
                  />
                  <PercentSlider
                    label="A / B"
                    name="Vertical A/B"
                    value={taperPosOf(selected, "v")}
                    onChange={(value) => updateSelected({ taperVPos: value })}
                    min={5}
                    max={95}
                  />
                </div>
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
