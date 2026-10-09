import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import ToolsSidebarMenu from "../components/ToolsSidebarMenu";
import useAppLogo from "../hooks/useAppLogo.js";
import { UI } from "../utils/uiThemeTokens.js";
import {
  GALAXY_EXPLORER_ALTERNATES,
  GALAXY_EXPLORER_PARTS,
  GALAXY_EXPLORER_SOURCE,
} from "../data/galaxyExplorer928.js";

const STORAGE_KEY = "sgf-parts-galaxy-explorer-928";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const PAGE_TEXT = UI.pageText;
const WHITE = UI.cardBg;

const COLOR_LABEL = {
  OldGray: "Old gray",
  TrGreen: "Trans green",
  TrRed: "Trans red",
  TrYellow: "Trans yellow",
};

const COLOR_SWATCH = {
  OldGray: "#9b9b9b",
  Blue: "#0057a6",
  TrGreen: "#63c56d",
  TrRed: "#e24b4b",
  TrYellow: "#f0d34a",
  White: "#f7f7f7",
  Red: "#c40000",
  Black: "#222222",
  Yellow: "#f4d100",
};

function colorLabel(color) {
  return COLOR_LABEL[color] || color;
}

function readStoredCounts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function countFor(counts, part) {
  const value = Number(counts[part.id]) || 0;
  return Math.max(0, Math.min(part.qty, value));
}

function progressFor(counts) {
  let found = 0;
  let need = 0;
  const altFound = {};
  for (const part of GALAXY_EXPLORER_PARTS) {
    const count = countFor(counts, part);
    if (part.alt) {
      altFound[part.alt] = (altFound[part.alt] || 0) + count;
    } else {
      found += count;
      need += part.qty;
    }
  }
  for (const [key, info] of Object.entries(GALAXY_EXPLORER_ALTERNATES)) {
    found += Math.min(info.qty, altFound[key] || 0);
    need += info.qty;
  }
  return { found, need };
}

export default function Parts() {
  const logo = useAppLogo();
  const location = useLocation();
  const [counts, setCounts] = useState(readStoredCounts);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
  }, [counts]);

  const altFound = useMemo(() => {
    const totals = {};
    for (const part of GALAXY_EXPLORER_PARTS) {
      if (!part.alt) continue;
      totals[part.alt] = (totals[part.alt] || 0) + countFor(counts, part);
    }
    return totals;
  }, [counts]);

  function lineDone(part) {
    if (countFor(counts, part) >= part.qty) return true;
    if (!part.alt) return false;
    const info = GALAXY_EXPLORER_ALTERNATES[part.alt];
    return (altFound[part.alt] || 0) >= info.qty;
  }

  function setCount(part, next) {
    const value = Math.max(0, Math.min(part.qty, next));
    setCounts((prev) => ({ ...prev, [part.id]: value }));
  }

  const { found, need } = progressFor(counts);
  const needle = query.trim().toLowerCase();
  const visible = GALAXY_EXPLORER_PARTS.filter((part) => {
    const done = lineDone(part);
    if (filter === "need" && done) return false;
    if (filter === "got" && !done) return false;
    if (!needle) return true;
    const haystack = `${part.number} ${part.name} ${colorLabel(part.color)}`.toLowerCase();
    return haystack.includes(needle);
  });

  function clearTicks() {
    if (!window.confirm("Clear every tick on this list?")) return;
    setCounts({});
  }

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
        <Link to="/projects" style={{ position: "absolute", left: "40px", cursor: "pointer" }}>
          <img src={logo} alt="SGF Logo" style={{ width: "120px", height: "auto" }} />
        </Link>
        <h1
          style={{
            margin: 0,
            fontSize: "2.4rem",
            fontWeight: 700,
            color: PAGE_TEXT,
            letterSpacing: "1px",
          }}
        >
          Parts
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
        <ToolsSidebarMenu activePath={location.pathname} fillHeight />
        <div
          className="content-section"
          style={{
            background: SECTION_GREY,
            borderRadius: "18px",
            flex: 1,
            minHeight: 0,
            height: "100%",
            boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
            padding: "20px 24px",
            boxSizing: "border-box",
            overflow: "hidden",
            color: MONUMENT,
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "1.35rem", fontWeight: 700 }}>LEGO 928 Galaxy Explorer</div>
              <div style={{ marginTop: "4px", fontSize: "0.92rem" }}>
                Non-US version of 497 · 1979 · ticks stay in this browser
              </div>
            </div>
            <a href={GALAXY_EXPLORER_SOURCE} target="_blank" rel="noreferrer" style={{ color: MONUMENT, fontSize: "0.9rem" }}>
              Inventory source
            </a>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.95rem", marginBottom: "6px" }}>
              <span>
                {found} of {need} pieces
              </span>
              <span>{need > 0 ? Math.round((found / need) * 100) : 0}%</span>
            </div>
            <div style={{ height: "8px", borderRadius: "999px", background: WHITE, overflow: "hidden", border: `1px solid ${UI.outline}` }}>
              <div
                style={{
                  width: `${need > 0 ? (found / need) * 100 : 0}%`,
                  height: "100%",
                  background: "#3d6b4f",
                }}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search number, name, or colour"
              aria-label="Search parts"
              style={{
                flex: "1 1 220px",
                minWidth: "180px",
                background: WHITE,
                color: MONUMENT,
                border: `1px solid ${UI.outline}`,
                borderRadius: "10px",
                padding: "8px 12px",
                fontSize: "0.95rem",
              }}
            />
            {[
              ["all", "All"],
              ["need", "Still need"],
              ["got", "Got"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                style={{
                  background: filter === id ? MONUMENT : WHITE,
                  color: filter === id ? PAGE_TEXT : MONUMENT,
                  border: `1px solid ${UI.outline}`,
                  borderRadius: "10px",
                  padding: "8px 12px",
                  cursor: "pointer",
                  fontSize: "0.92rem",
                }}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={clearTicks}
              style={{
                marginLeft: "auto",
                background: WHITE,
                color: MONUMENT,
                border: `1px solid ${UI.outline}`,
                borderRadius: "10px",
                padding: "8px 12px",
                cursor: "pointer",
                fontSize: "0.92rem",
              }}
            >
              Clear ticks
            </button>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
            {visible.length === 0 ? (
              <div style={{ padding: "24px 8px" }}>No parts match.</div>
            ) : (
              visible.map((part) => {
                const count = countFor(counts, part);
                const done = lineDone(part);
                const covered = done && count < part.qty;
                return (
                  <div
                    key={part.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "14px",
                      background: WHITE,
                      border: `1px solid ${UI.outline}`,
                      borderRadius: "12px",
                      padding: "8px 12px",
                      opacity: done ? 0.72 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={count >= part.qty}
                      aria-label={`Got ${part.number} ${part.name}`}
                      onChange={() => setCount(part, count >= part.qty ? 0 : part.qty)}
                      style={{ width: "22px", height: "22px", flexShrink: 0, cursor: "pointer" }}
                    />
                    <img
                      src={part.image}
                      alt=""
                      width={120}
                      height={90}
                      style={{
                        width: "120px",
                        height: "90px",
                        objectFit: "contain",
                        background: "#fff",
                        borderRadius: "8px",
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>
                        {part.number}
                        <span style={{ fontWeight: 500 }}> · {part.name}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px", fontSize: "0.9rem" }}>
                        <span
                          aria-hidden="true"
                          style={{
                            width: "12px",
                            height: "12px",
                            borderRadius: "50%",
                            background: COLOR_SWATCH[part.color] || "#ccc",
                            border: `1px solid ${UI.outline}`,
                            flexShrink: 0,
                          }}
                        />
                        {colorLabel(part.color)}
                      </div>
                      {part.alt ? (
                        <div style={{ marginTop: "4px", fontSize: "0.85rem" }}>
                          {GALAXY_EXPLORER_ALTERNATES[part.alt].label}
                          {covered ? " This line is already covered." : ""}
                        </div>
                      ) : null}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                      <button
                        type="button"
                        aria-label={`Fewer ${part.number}`}
                        onClick={() => setCount(part, count - 1)}
                        disabled={count === 0}
                        style={stepStyle}
                      >
                        −
                      </button>
                      <div style={{ minWidth: "52px", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                        {count} / {part.qty}
                      </div>
                      <button
                        type="button"
                        aria-label={`More ${part.number}`}
                        onClick={() => setCount(part, count + 1)}
                        disabled={count >= part.qty}
                        style={stepStyle}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const stepStyle = {
  width: "32px",
  height: "32px",
  borderRadius: "8px",
  border: `1px solid ${UI.outline}`,
  background: SECTION_GREY,
  color: MONUMENT,
  cursor: "pointer",
  fontSize: "1.1rem",
  lineHeight: 1,
};
