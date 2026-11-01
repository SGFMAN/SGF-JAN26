import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getApiHeaders } from "../utils/auth";
import { UI } from "../utils/uiThemeTokens.js";

const COLUMNS = [
  ["date", "Date"],
  ["name", "Activity name"],
  ["distanceKm", "Distance (km)"],
  ["duration", "Duration"],
  ["pace", "Average pace (min/km)"],
  ["averageHeartRate", "Average heart rate"],
  ["maxHeartRate", "Maximum heart rate"],
  ["averageCadence", "Average cadence"],
];

function cell(value) {
  return value == null || value === "" ? "—" : value;
}

const MONTHS = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

function runDate(run) {
  if (run.monthKey) {
    const day = String(run.date || "").match(/^(\d{1,2})/);
    const [year, month] = String(run.monthKey).split("-");
    if (day && year && month) {
      return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day[1])));
    }
  }
  const match = String(run.date || "").match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/);
  const month = match ? MONTHS[match[2].toLowerCase()] : null;
  if (!match || !month) return null;
  return new Date(Date.UTC(Number(match[3]), Number(month) - 1, Number(match[1])));
}

function monthOf(run) {
  if (run.monthKey && run.monthLabel) return { key: `month:${run.monthKey}`, label: run.monthLabel };
  const date = runDate(run);
  if (!date) return { key: "month:unknown", label: "Undated" };
  return {
    key: `month:${date.toISOString().slice(0, 7)}`,
    label: new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }).format(date),
  };
}

function weekOf(run) {
  if (run.weekKey && run.weekLabel) return { key: `week:${run.weekKey}`, label: run.weekLabel };
  const date = runDate(run);
  if (!date) return { key: "week:unknown", label: "Undated" };
  const day = date.getUTCDay() || 7;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - (day - 1));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const sameYear = monday.getUTCFullYear() === sunday.getUTCFullYear();
  const start = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
    timeZone: "UTC",
  }).format(monday);
  const end = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(sunday);
  return { key: `week:${monday.toISOString().slice(0, 10)}`, label: `${start} – ${end}` };
}

function groupRuns(runs, view) {
  const groups = [];
  const byKey = new Map();
  for (const run of runs) {
    const period = view === "week" ? weekOf(run) : monthOf(run);
    let group = byKey.get(period.key);
    if (!group) {
      group = { key: period.key, label: period.label, runs: [] };
      byKey.set(period.key, group);
      groups.push(group);
    }
    group.runs.push(run);
  }
  return groups.map((group) => {
    const km = group.runs.reduce((sum, run) => sum + (Number(run.distanceKm) || 0), 0);
    return { ...group, count: group.runs.length, totalKm: km.toFixed(2) };
  });
}

export default function GarminRuns() {
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("month");
  const [openKeys, setOpenKeys] = useState(() => new Set());
  const seeded = useRef({ month: false, week: false });
  const groups = useMemo(() => groupRuns(runs || [], view), [runs, view]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/sandpit/garmin-runs", {
        headers: getApiHeaders(),
        credentials: "include",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) {
        setRuns([]);
        setError(body.error || "Runs could not be loaded.");
        return;
      }
      setRuns(Array.isArray(body.runs) ? body.runs : []);
    } catch {
      setRuns([]);
      setError("Runs could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (seeded.current[view] || groups.length === 0) return;
    seeded.current[view] = true;
    setOpenKeys((current) => new Set(current).add(groups[0].key));
  }, [groups, view]);

  function toggleGroup(key) {
    setOpenKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "auto",
        padding: "72px 20px 32px",
        boxSizing: "border-box",
        color: UI.pageText,
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 750 }}>Garmin Runs</h1>
            <p style={{ margin: "6px 0 0", opacity: 0.75 }}>Running activities from Garmin Connect</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div role="group" aria-label="Group runs by" style={{ display: "flex" }}>
              {[["month", "Month"], ["week", "Week"]].map(([id, label], index) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={view === id}
                  onClick={() => setView(id)}
                  style={{
                    color: UI.pageText,
                    fontSize: "0.9rem",
                    border: "1px solid rgba(240, 180, 41, 0.75)",
                    borderRadius: index === 0 ? "8px 0 0 8px" : "0 8px 8px 0",
                    marginLeft: index === 0 ? 0 : -1,
                    padding: "8px 14px",
                    background: view === id ? "rgba(240, 180, 41, 0.28)" : "rgba(6, 17, 39, 0.72)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              style={{
                color: UI.pageText,
                fontSize: "0.9rem",
                border: "1px solid rgba(240, 180, 41, 0.75)",
                borderRadius: 8,
                padding: "8px 14px",
                background: "rgba(6, 17, 39, 0.72)",
                cursor: loading ? "default" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {loading ? "Refreshing…" : "Refresh Runs"}
            </button>
          </div>
        </div>

        {loading && runs == null ? <p>Loading runs…</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        {!loading && !error && runs && runs.length === 0 ? <p>No running activities were returned.</p> : null}

        {runs && runs.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 18 }}>
            {groups.map((group) => {
              const open = openKeys.has(group.key);
              const countLabel = group.count === 1 ? "1 run" : `${group.count} runs`;
              return (
                <section key={group.key} style={{ border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, overflow: "hidden" }}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggleGroup(group.key)}
                    style={{
                      width: "100%",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                      textAlign: "left",
                      color: UI.pageText,
                      background: "rgba(6, 17, 39, 0.72)",
                      border: 0,
                      padding: "12px 14px",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <span style={{ fontSize: "1.05rem", fontWeight: 750 }}>{open ? "▾" : "▸"} {group.label}</span>
                    <span style={{ opacity: 0.85 }}>{group.totalKm} km · {countLabel}</span>
                  </button>
                  {open ? (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860, background: UI.cardBg, color: UI.textPrimary }}>
                        <thead>
                          <tr>
                            {COLUMNS.map(([, label]) => (
                              <th
                                key={label}
                                style={{
                                  textAlign: "left",
                                  padding: "10px 12px",
                                  borderBottom: "1px solid rgba(0,0,0,0.12)",
                                  fontSize: "0.82rem",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {group.runs.map((run, index) => (
                            <tr key={run.id ?? `${run.date}-${index}`}>
                              {COLUMNS.map(([key]) => (
                                <td
                                  key={key}
                                  style={{
                                    padding: "10px 12px",
                                    borderBottom: "1px solid rgba(0,0,0,0.08)",
                                    fontSize: "0.92rem",
                                    verticalAlign: "top",
                                  }}
                                >
                                  {cell(run[key])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
