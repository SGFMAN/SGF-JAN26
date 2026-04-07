import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import logo from "../images/logo.png";

const API_URL = "";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const LIGHT_MONUMENT = "#42464d";
const WHITE = "#fff";
const EXPLORER_BG = "#f3f3f3";
const EXPLORER_BORDER = "#d1d1d1";
const ROW_ALT = "#fafafa";
const ROW_HOVER = "#e5f3ff";
const HEADER_BG = "#f8f8f8";

function formatSize(bytes) {
  if (bytes == null || bytes === "") return "";
  const n = Number(bytes);
  if (Number.isNaN(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function fileIcon(entry) {
  if (entry.isDirectory) return "📁";
  const e = (entry.extension || "").toLowerCase();
  if (e === "pdf") return "📕";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(e)) return "🖼";
  if (["xlsx", "xls", "csv"].includes(e)) return "📊";
  if (["doc", "docx"].includes(e)) return "📘";
  return "📄";
}

export default function BenBox() {
  const [relPath, setRelPath] = useState("");
  const [history, setHistory] = useState([]);
  const [root, setRoot] = useState("");
  const [entries, setEntries] = useState([]);
  const [parentPath, setParentPath] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (pathStr) => {
    setLoading(true);
    setError(null);
    try {
      const q = pathStr ? `?path=${encodeURIComponent(pathStr)}` : "";
      const res = await fetch(`${API_URL}/api/benbox/list${q}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || res.statusText || "Failed to load folder");
      }
      setRoot(data.root || "");
      setRelPath(data.path || "");
      setParentPath(data.parentPath === undefined ? null : data.parentPath);
      setEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch (e) {
      setError(e.message || "Failed to load");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(relPath);
  }, [relPath, load]);

  const displayAddress =
    root && relPath ? `${root}\\${relPath.replace(/\//g, "\\")}` : root || "";

  function openFolder(name) {
    const next = relPath ? `${relPath}/${name}` : name;
    setHistory((h) => [...h, relPath]);
    setRelPath(next.replace(/\\/g, "/"));
  }

  function goUp() {
    if (parentPath === null) return;
    setHistory((h) => [...h, relPath]);
    setRelPath(parentPath || "");
  }

  function goBack() {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setRelPath(prev || "");
  }

  const atRoot = !relPath;

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
        <Link to="/projects" style={{ position: "absolute", left: "40px", cursor: "pointer" }}>
          <img src={logo} alt="SGF Logo" style={{ width: "120px", height: "auto" }} />
        </Link>
        <h1
          style={{
            margin: 0,
            fontSize: "2.4rem",
            fontWeight: 700,
            color: WHITE,
            letterSpacing: "1px",
          }}
        >
          BenBox
        </h1>
      </div>

      <div
        className="sections-container"
        style={{
          display: "flex",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          margin: "24px auto 48px auto",
          gap: "32px",
        }}
      >
        <div
          className="sidebar-menu"
          style={{
            background: SECTION_GREY,
            borderRadius: "16px",
            width: "200px",
            minWidth: "200px",
            minHeight: "520px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
            padding: "32px 12px",
            boxSizing: "border-box",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            gap: "18px",
            color: MONUMENT,
          }}
        >
          <div style={{ flex: 1 }} />
          <Link
            to="/projects"
            style={{
              background: WHITE,
              color: MONUMENT,
              border: "none",
              borderRadius: "10px",
              padding: "13px 8px",
              fontSize: "1.05rem",
              fontWeight: 500,
              textAlign: "center",
              textDecoration: "none",
              letterSpacing: "0.5px",
              display: "block",
            }}
          >
            ← Back to Main
          </Link>
        </div>

        <div
          className="content-section"
          style={{
            background: SECTION_GREY,
            borderRadius: "18px",
            flex: 1,
            minHeight: "520px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
            padding: "16px",
            boxSizing: "border-box",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Windows Explorer–style shell */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              background: EXPLORER_BG,
              borderRadius: "8px",
              border: `1px solid ${EXPLORER_BORDER}`,
              overflow: "hidden",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 10px",
                borderBottom: `1px solid ${EXPLORER_BORDER}`,
                background: "#ececec",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                disabled={history.length === 0}
                onClick={goBack}
                title="Back"
                style={{
                  padding: "6px 12px",
                  fontSize: "0.85rem",
                  border: `1px solid ${EXPLORER_BORDER}`,
                  borderRadius: "4px",
                  background: history.length === 0 ? "#e8e8e8" : WHITE,
                  cursor: history.length === 0 ? "not-allowed" : "pointer",
                  color: MONUMENT,
                }}
              >
                ← Back
              </button>
              <button
                type="button"
                disabled={atRoot}
                onClick={goUp}
                title="Up"
                style={{
                  padding: "6px 12px",
                  fontSize: "0.85rem",
                  border: `1px solid ${EXPLORER_BORDER}`,
                  borderRadius: "4px",
                  background: atRoot ? "#e8e8e8" : WHITE,
                  cursor: atRoot ? "not-allowed" : "pointer",
                  color: MONUMENT,
                }}
              >
                ↑ Up
              </button>
              <div style={{ flex: 1, minWidth: "200px" }}>
                <div style={{ fontSize: "0.7rem", color: "#666", marginBottom: "2px" }}>Address</div>
                <input
                  readOnly
                  value={loading ? "Loading…" : displayAddress || error || ""}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "6px 10px",
                    fontSize: "0.85rem",
                    fontFamily: "Consolas, 'Segoe UI Mono', monospace",
                    border: `1px solid ${EXPLORER_BORDER}`,
                    borderRadius: "4px",
                    background: WHITE,
                    color: MONUMENT,
                  }}
                />
              </div>
            </div>

            <div style={{ flex: 1, overflow: "auto", background: WHITE }}>
              {error && (
                <div style={{ padding: "24px", color: "#c0392b", fontSize: "0.95rem" }}>{error}</div>
              )}
              {!error && (
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.9rem",
                    color: MONUMENT,
                  }}
                >
                  <thead>
                    <tr style={{ background: HEADER_BG, borderBottom: `1px solid ${EXPLORER_BORDER}` }}>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "8px 12px",
                          fontWeight: 600,
                          width: "45%",
                          borderRight: `1px solid ${EXPLORER_BORDER}`,
                        }}
                      >
                        Name
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "8px 12px",
                          fontWeight: 600,
                          width: "22%",
                          borderRight: `1px solid ${EXPLORER_BORDER}`,
                        }}
                      >
                        Date modified
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "8px 12px",
                          fontWeight: 600,
                          width: "18%",
                          borderRight: `1px solid ${EXPLORER_BORDER}`,
                        }}
                      >
                        Type
                      </th>
                      <th style={{ textAlign: "right", padding: "8px 12px", fontWeight: 600, width: "15%" }}>
                        Size
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr>
                        <td colSpan={4} style={{ padding: "24px", color: "#666" }}>
                          Loading folder…
                        </td>
                      </tr>
                    )}
                    {!loading &&
                      entries.map((entry, i) => (
                        <tr
                          key={`${entry.name}-${i}`}
                          onDoubleClick={() => entry.isDirectory && openFolder(entry.name)}
                          style={{
                            background: i % 2 === 0 ? WHITE : ROW_ALT,
                            cursor: entry.isDirectory ? "pointer" : "default",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = ROW_HOVER;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = i % 2 === 0 ? WHITE : ROW_ALT;
                          }}
                        >
                          <td
                            style={{
                              padding: "6px 12px",
                              borderBottom: `1px solid ${EXPLORER_BORDER}`,
                              borderRight: `1px solid ${EXPLORER_BORDER}`,
                              userSelect: "none",
                            }}
                          >
                            <span style={{ marginRight: "8px", fontSize: "1.1rem", verticalAlign: "middle" }}>
                              {fileIcon(entry)}
                            </span>
                            <span style={{ verticalAlign: "middle" }}>{entry.name}</span>
                          </td>
                          <td
                            style={{
                              padding: "6px 12px",
                              borderBottom: `1px solid ${EXPLORER_BORDER}`,
                              borderRight: `1px solid ${EXPLORER_BORDER}`,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formatDate(entry.modified)}
                          </td>
                          <td
                            style={{
                              padding: "6px 12px",
                              borderBottom: `1px solid ${EXPLORER_BORDER}`,
                              borderRight: `1px solid ${EXPLORER_BORDER}`,
                            }}
                          >
                            {entry.typeLabel}
                          </td>
                          <td
                            style={{
                              padding: "6px 12px",
                              borderBottom: `1px solid ${EXPLORER_BORDER}`,
                              textAlign: "right",
                              fontFamily: "Consolas, 'Segoe UI Mono', monospace",
                              fontSize: "0.85rem",
                            }}
                          >
                            {entry.isDirectory ? "" : formatSize(entry.size)}
                          </td>
                        </tr>
                      ))}
                    {!loading && entries.length === 0 && !error && (
                      <tr>
                        <td colSpan={4} style={{ padding: "24px", color: "#666" }}>
                          This folder is empty.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
            <div
              style={{
                padding: "6px 12px",
                borderTop: `1px solid ${EXPLORER_BORDER}`,
                background: EXPLORER_BG,
                fontSize: "0.8rem",
                color: "#555",
              }}
            >
              {loading ? " " : `${entries.length} item${entries.length === 1 ? "" : "s"}`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
