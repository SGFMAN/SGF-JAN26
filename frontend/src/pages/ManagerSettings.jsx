import React, { useEffect, useState } from "react";
import { UI, outlineBorder } from "../utils/uiThemeTokens.js";
import {
  NEXT_OUTS_PHASE_OPTIONS,
  NEXT_OUTS_OVERVIEW_OPTIONS,
  NEXT_OUTS_SORT_DIRECTIONS,
  constrainNextOutsSortToOverviewKeys,
  normalizeManagerSettings,
  normalizeNextOutsSort,
  unusedOverviewSortOptions,
} from "../utils/managerSettings.js";

const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const API_URL = "";

const cardStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  backgroundColor: "#E5E5E7",
  padding: "14px 16px",
  borderRadius: "8px",
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
};

const checkboxRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "8px 10px",
  borderRadius: "8px",
  background: WHITE,
  cursor: "pointer",
};

const selectStyle = {
  height: "32px",
  padding: "0 8px",
  fontSize: "0.85rem",
  fontWeight: 500,
  color: MONUMENT,
  background: WHITE,
  border: outlineBorder,
  borderRadius: "8px",
  cursor: "pointer",
  outline: "none",
  minWidth: 0,
  boxSizing: "border-box",
};

const addButtonStyle = {
  alignSelf: "flex-start",
  height: "32px",
  padding: "0 12px",
  fontSize: "0.85rem",
  fontWeight: 600,
  color: MONUMENT,
  background: WHITE,
  border: outlineBorder,
  borderRadius: "8px",
  cursor: "pointer",
};

export default function ManagerSettings() {
  const [settings, setSettings] = useState(() => normalizeManagerSettings(null));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_URL}/api/manager-settings`);
        if (cancelled) return;
        if (response.ok) {
          const data = await response.json().catch(() => ({}));
          setSettings(normalizeManagerSettings(data?.settings));
        } else {
          setSettings(normalizeManagerSettings(null));
        }
      } catch (err) {
        console.error("Error loading manager settings:", err);
        if (!cancelled) setSettings(normalizeManagerSettings(null));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveSettings(next) {
    try {
      const response = await fetch(`${API_URL}/api/manager-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: next }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        alert(`Failed to save manager settings: ${errorData.error || response.statusText}`);
      }
    } catch (error) {
      console.error("Error saving manager settings:", error);
      alert(`Error saving manager settings: ${error.message}`);
    }
  }

  function commitSettings(updater) {
    setSettings((prev) => {
      const next = updater(prev);
      void saveSettings(next);
      return next;
    });
  }

  function togglePhase(phase) {
    commitSettings((prev) => {
      const selected = new Set(prev.nextOutsIncludedPhases);
      if (selected.has(phase)) selected.delete(phase);
      else selected.add(phase);
      return {
        ...prev,
        nextOutsIncludedPhases: NEXT_OUTS_PHASE_OPTIONS.filter((value) => selected.has(value)),
      };
    });
  }

  function toggleOverview(key) {
    commitSettings((prev) => {
      const selected = new Set(prev.nextOutsOverviewKeys);
      if (selected.has(key)) selected.delete(key);
      else selected.add(key);
      const nextOutsOverviewKeys = NEXT_OUTS_OVERVIEW_OPTIONS.map((item) => item.key).filter((value) =>
        selected.has(value)
      );
      return {
        ...prev,
        nextOutsOverviewKeys,
        nextOutsSort: constrainNextOutsSortToOverviewKeys(prev.nextOutsSort, nextOutsOverviewKeys),
      };
    });
  }

  function updateSortLevel(index, patch) {
    commitSettings((prev) => {
      let nextSort = prev.nextOutsSort.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row
      );
      if (index === 0 && Object.prototype.hasOwnProperty.call(patch, "key") && !patch.key) {
        nextSort = [{ key: "", direction: nextSort[0]?.direction || "asc" }];
      }
      return { ...prev, nextOutsSort: normalizeNextOutsSort(nextSort) };
    });
  }

  function addSortLevel() {
    commitSettings((prev) => {
      const remaining = unusedOverviewSortOptions(
        prev.nextOutsSort,
        undefined,
        prev.nextOutsOverviewKeys
      );
      if (remaining.length === 0 || prev.nextOutsSort.some((row) => !row.key)) return prev;
      return {
        ...prev,
        nextOutsSort: normalizeNextOutsSort([
          ...prev.nextOutsSort,
          { key: remaining[0].key, direction: "asc" },
        ]),
      };
    });
  }

  function removeSortLevel(index) {
    commitSettings((prev) => {
      if (prev.nextOutsSort.length <= 1) return prev;
      return {
        ...prev,
        nextOutsSort: normalizeNextOutsSort(
          prev.nextOutsSort.filter((_, rowIndex) => rowIndex !== index)
        ),
      };
    });
  }

  const canAddSort =
    !loading &&
    settings.nextOutsSort.every((row) => row.key) &&
    unusedOverviewSortOptions(settings.nextOutsSort, undefined, settings.nextOutsOverviewKeys)
      .length > 0;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        padding: "28px 32px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: "20px",
        overflow: "auto",
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: "1.5rem",
          fontWeight: 700,
          color: MONUMENT,
        }}
      >
        Managers
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(220px, 280px) minmax(0, 1fr) minmax(280px, 360px)",
          alignItems: "start",
          gap: "16px",
          width: "100%",
        }}
      >
        <div style={cardStyle}>
          <h3 style={{ fontSize: "1rem", margin: 0, color: MONUMENT, fontWeight: 600 }}>
            Next Outs statuses
          </h3>
          <p style={{ margin: 0, fontSize: "0.9rem", color: UI.textMuted, lineHeight: 1.4 }}>
            Include these project statuses on the Next Outs list.
          </p>
          {loading ? (
            <p style={{ margin: 0, color: UI.textMuted }}>Loading…</p>
          ) : (
            NEXT_OUTS_PHASE_OPTIONS.map((phase) => (
              <label key={phase} htmlFor={`next-outs-phase-${phase}`} style={checkboxRowStyle}>
                <input
                  id={`next-outs-phase-${phase}`}
                  type="checkbox"
                  checked={settings.nextOutsIncludedPhases.includes(phase)}
                  onChange={() => togglePhase(phase)}
                  style={{ width: "18px", height: "18px", cursor: "pointer", flexShrink: 0 }}
                />
                <span style={{ fontSize: "0.9rem", color: MONUMENT }}>{phase}</span>
              </label>
            ))
          )}
        </div>

        <div style={cardStyle}>
          <h3 style={{ fontSize: "1rem", margin: 0, color: MONUMENT, fontWeight: 600 }}>
            Next Outs overview items
          </h3>
          <p style={{ margin: 0, fontSize: "0.9rem", color: UI.textMuted, lineHeight: 1.4 }}>
            Show these Overview items as columns on Next Outs.
          </p>
          {loading ? (
            <p style={{ margin: 0, color: UI.textMuted }}>Loading…</p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "8px",
                width: "100%",
              }}
            >
              {NEXT_OUTS_OVERVIEW_OPTIONS.map((item) => (
                <label key={item.key} htmlFor={`next-outs-overview-${item.key}`} style={checkboxRowStyle}>
                  <input
                    id={`next-outs-overview-${item.key}`}
                    type="checkbox"
                    checked={settings.nextOutsOverviewKeys.includes(item.key)}
                    onChange={() => toggleOverview(item.key)}
                    style={{ width: "18px", height: "18px", cursor: "pointer", flexShrink: 0 }}
                  />
                  <span style={{ fontSize: "0.9rem", color: MONUMENT }}>{item.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <h3 style={{ fontSize: "1rem", margin: 0, color: MONUMENT, fontWeight: 600 }}>
            Next Outs sort
          </h3>
          <p style={{ margin: 0, fontSize: "0.9rem", color: UI.textMuted, lineHeight: 1.4 }}>
            Sort the Next Outs list by Overview fields. Add extra levels for tie-breaks.
          </p>
          {loading ? (
            <p style={{ margin: 0, color: UI.textMuted }}>Loading…</p>
          ) : (
            <>
              {settings.nextOutsSort.map((row, index) => {
                const options = unusedOverviewSortOptions(
                  settings.nextOutsSort,
                  row.key,
                  settings.nextOutsOverviewKeys
                );
                return (
                  <div
                    key={`sort-${index}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      width: "100%",
                    }}
                  >
                    <select
                      aria-label={`Sort field ${index + 1}`}
                      value={row.key}
                      onChange={(e) => updateSortLevel(index, { key: e.target.value })}
                      style={{ ...selectStyle, flex: 1 }}
                    >
                      {index === 0 ? <option value="">Select field</option> : null}
                      {options.map((item) => (
                        <option key={item.key} value={item.key}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`Sort direction ${index + 1}`}
                      value={row.direction}
                      onChange={(e) => updateSortLevel(index, { direction: e.target.value })}
                      style={{ ...selectStyle, width: "88px", flexShrink: 0 }}
                    >
                      {NEXT_OUTS_SORT_DIRECTIONS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    {settings.nextOutsSort.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeSortLevel(index)}
                        aria-label={`Remove sort ${index + 1}`}
                        style={{
                          ...addButtonStyle,
                          padding: "0 8px",
                          fontWeight: 500,
                        }}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={addSortLevel}
                disabled={!canAddSort}
                style={{
                  ...addButtonStyle,
                  opacity: canAddSort ? 1 : 0.45,
                  cursor: canAddSort ? "pointer" : "not-allowed",
                }}
              >
                Add
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
