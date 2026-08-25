import React, { useCallback, useEffect, useMemo, useState } from "react";

import ModalBackdrop from "../components/ModalBackdrop";
import { getApiHeaders } from "../utils/auth";
import { UI } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const GRID_LINE = "#c5c9ce";
const API_URL = "";

function formatListDate(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function stateKey(row) {
  return String(row?.state || "").trim().toUpperCase();
}

function formatCallbackLine(row) {
  return [
    String(row?.suburb || "").trim(),
    String(row?.street || "").trim(),
    String(row?.client_name || "").trim(),
    String(row?.email || "").trim(),
    String(row?.phone || "").trim(),
  ]
    .filter(Boolean)
    .join(" ") || "—";
}

function groupCallbackItems(items) {
  const list = Array.isArray(items) ? items : [];
  return {
    vic: list.filter((row) => stateKey(row) === "VIC"),
    qld: list.filter((row) => stateKey(row) === "QLD"),
    other: list.filter((row) => {
      const state = stateKey(row);
      return state !== "VIC" && state !== "QLD";
    }),
  };
}

function allItemsCalled(items) {
  const list = Array.isArray(items) ? items : [];
  return list.length > 0 && list.every((item) => item.called);
}

const toolbarButtonStyle = {
  background: MONUMENT,
  color: PAGE_TEXT,
  border: "none",
  borderRadius: "10px",
  padding: "10px 20px",
  fontSize: "1rem",
  fontWeight: 500,
  whiteSpace: "nowrap",
  flexShrink: 0,
};

export default function QuoteCallbackLists() {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingKey, setSavingKey] = useState("");
  const [eraseList, setEraseList] = useState(null);
  const [erasing, setErasing] = useState(false);

  const orderedLists = useMemo(
    () =>
      [...lists].sort((a, b) => {
        const aTime = new Date(a.sent_at).getTime();
        const bTime = new Date(b.sent_at).getTime();
        const aSafe = Number.isFinite(aTime) ? aTime : 0;
        const bSafe = Number.isFinite(bTime) ? bTime : 0;
        if (aSafe !== bSafe) return aSafe - bSafe;
        return Number(a.id) - Number(b.id);
      }),
    [lists]
  );

  const loadLists = useCallback(async ({ silent } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      const res = await fetch(`${API_URL}/api/quote-callback-lists`, { headers: getApiHeaders() });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setLists(Array.isArray(data) ? data : []);
    } catch (err) {
      if (!silent) {
        setError(err.message || "Failed to load call back lists");
        setLists([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  useEffect(() => {
    const timer = setInterval(() => {
      void loadLists({ silent: true });
    }, 20000);
    return () => clearInterval(timer);
  }, [loadLists]);

  async function handleToggleCalled(list, item, called) {
    const saveKey = `${list.id}:${item.key}`;
    setSavingKey(saveKey);
    const previous = lists;
    const nextLists = lists.map((row) => {
      if (row.id !== list.id) return row;
      return {
        ...row,
        items: (row.items || []).map((entry) =>
          entry.key === item.key ? { ...entry, called } : entry
        ),
      };
    });
    setLists(nextLists);
    try {
      const res = await fetch(`${API_URL}/api/quote-callback-lists/${list.id}/items/${encodeURIComponent(item.key)}`, {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify({ called }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setLists((current) => current.map((row) => (row.id === data.id ? data : row)));
      const updatedItems = Array.isArray(data.items) ? data.items : [];
      if (called && allItemsCalled(updatedItems)) {
        setEraseList(data);
      }
    } catch (err) {
      setLists(previous);
      alert(err.message || "Failed to update call back");
    } finally {
      setSavingKey("");
    }
  }

  async function handleEraseList() {
    if (!eraseList) return;
    setErasing(true);
    try {
      const res = await fetch(`${API_URL}/api/quote-callback-lists/${eraseList.id}`, {
        method: "DELETE",
        headers: getApiHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setLists((current) => current.filter((row) => row.id !== eraseList.id));
      setEraseList(null);
    } catch (err) {
      alert(err.message || "Failed to erase call back list");
    } finally {
      setErasing(false);
    }
  }

  function renderSection(title, rows, list) {
    return (
      <div style={{ marginTop: "12px" }}>
        <h4
          style={{
            margin: "0 0 8px 0",
            fontSize: "0.95rem",
            fontWeight: 700,
            color: MONUMENT,
          }}
        >
          {title}
        </h4>
        {rows.length === 0 ? (
          <div style={{ fontSize: "0.9rem", color: UI.textMuted, padding: "2px 0 2px 28px" }}>None</div>
        ) : (
          rows.map((item) => {
            const rowBusy = savingKey === `${list.id}:${item.key}`;
            return (
              <label
                key={item.key}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: "4px 0",
                  cursor: rowBusy ? "default" : "pointer",
                  opacity: rowBusy ? 0.7 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={Boolean(item.called)}
                  disabled={rowBusy}
                  onChange={(e) => handleToggleCalled(list, item, e.target.checked)}
                  style={{ width: "18px", height: "18px", marginTop: "2px", flexShrink: 0, cursor: "pointer" }}
                />
                <span
                  style={{
                    fontSize: "0.9rem",
                    color: MONUMENT,
                    lineHeight: 1.4,
                    wordBreak: "break-word",
                    textDecoration: item.called ? "line-through" : "none",
                    opacity: item.called ? 0.65 : 1,
                  }}
                >
                  {formatCallbackLine(item)}
                </span>
              </label>
            );
          })
        )}
      </div>
    );
  }

  if (loading) {
    return <div style={{ fontSize: "1rem" }}>Loading…</div>;
  }
  if (error) {
    return <div style={{ color: "#cc3333", fontSize: "1rem" }}>Error: {error}</div>;
  }

  return (
    <>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
        }}
      >
        {orderedLists.length === 0 ? (
          <div
            style={{
              background: WHITE,
              border: `1px solid ${GRID_LINE}`,
              borderRadius: "8px",
              padding: "16px",
              color: UI.textMuted,
              fontSize: "0.95rem",
            }}
          >
            No call back lists yet. A list appears here each time a Call Back List email is sent.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "16px",
              alignItems: "start",
            }}
          >
            {orderedLists.map((list) => {
              const groups = groupCallbackItems(list.items);
              return (
                <div
                  key={list.id}
                  style={{
                    background: WHITE,
                    border: `1px solid ${GRID_LINE}`,
                    borderRadius: "8px",
                    padding: "16px 18px",
                    minWidth: 0,
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: MONUMENT }}>
                    {formatListDate(list.sent_at) || "Call Back List"}
                  </h3>
                  {renderSection("VIC", groups.vic, list)}
                  {renderSection("QLD", groups.qld, list)}
                  {groups.other.length ? renderSection("Other", groups.other, list) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {eraseList ? (
        <ModalBackdrop zIndex={1000}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="erase-callback-list-title"
            style={{
              background: UI.panelBg,
              borderRadius: "18px",
              padding: "32px",
              width: "90%",
              maxWidth: "460px",
              boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="erase-callback-list-title"
              style={{
                fontSize: "1.5rem",
                fontWeight: 600,
                marginTop: 0,
                marginBottom: "12px",
                color: MONUMENT,
              }}
            >
              All call backs done
            </h2>
            <p style={{ margin: "0 0 24px 0", fontSize: "1rem", color: MONUMENT, lineHeight: 1.45 }}>
              Erase this list?
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
              <button
                type="button"
                disabled={erasing}
                onClick={() => setEraseList(null)}
                style={{
                  background: UI.inputBg,
                  color: MONUMENT,
                  border: "none",
                  borderRadius: "10px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: erasing ? "default" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={erasing}
                onClick={() => void handleEraseList()}
                style={{
                  ...toolbarButtonStyle,
                  cursor: erasing ? "default" : "pointer",
                  opacity: erasing ? 0.6 : 1,
                }}
              >
                {erasing ? "Erasing…" : "Erase"}
              </button>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}
    </>
  );
}
