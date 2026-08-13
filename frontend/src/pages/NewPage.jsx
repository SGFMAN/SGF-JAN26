import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import HotlistSidebarSection from "../components/HotlistSidebarSection";
import ProjectStatusSidebarSection from "../components/ProjectStatusSidebarSection";
import AdminToolsSidebarSection from "../components/AdminToolsSidebarSection";
import ManagersSalesMenuGroup from "../components/ManagersSalesMenuGroup";
import { getApiHeaders, isUserAdmin } from "../utils/auth";
import useAppLogo from "../hooks/useAppLogo.js";
import { UI } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const GRID_LINE = "#c5c9ce";
const HEADER_BG = "#e8eaed";
const API_URL = "";

const emptyDraft = () => ({
  suburb: "",
  street: "",
  name: "",
  email: "",
  phone: "",
  contacted: false,
  contacted_email: false,
  contacted_phone: false,
  contacted_visit: false,
});

const COLS = [
  { key: "suburb", label: "Suburb", type: "text", width: "12%" },
  { key: "street", label: "Street", type: "text", width: "16%" },
  { key: "name", label: "Name", type: "text", width: "12%" },
  { key: "email", label: "Email", type: "email", width: "16%" },
  { key: "phone", label: "Phone", type: "tel", width: "10%" },
  { key: "contacted", label: "Contacted", type: "check", width: "7%" },
  { key: "contacted_email", label: "Email", type: "subcheck", width: "5%" },
  { key: "contacted_phone", label: "Phone", type: "subcheck", width: "5%" },
  { key: "contacted_visit", label: "Visit", type: "subcheck", width: "5%" },
];

const cellBorder = `1px solid ${GRID_LINE}`;

const thStyle = {
  background: HEADER_BG,
  color: MONUMENT,
  fontSize: "0.78rem",
  fontWeight: 700,
  textAlign: "left",
  padding: "6px 8px",
  border: cellBorder,
  whiteSpace: "nowrap",
  position: "sticky",
  top: 0,
  zIndex: 1,
};

const tdStyle = {
  padding: 0,
  border: cellBorder,
  background: WHITE,
  verticalAlign: "middle",
};

const cellInputStyle = {
  width: "100%",
  minWidth: 0,
  border: "none",
  outline: "none",
  background: "transparent",
  padding: "6px 8px",
  fontSize: "0.85rem",
  color: MONUMENT,
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const checkCellStyle = {
  ...tdStyle,
  textAlign: "center",
  padding: "4px 2px",
};

const actionBtnStyle = {
  padding: "3px 8px",
  borderRadius: "4px",
  border: `1px solid ${GRID_LINE}`,
  background: WHITE,
  color: MONUMENT,
  fontSize: "0.75rem",
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

function applyContactedToggle(value, contacted) {
  return {
    ...value,
    contacted,
    contacted_email: contacted ? value.contacted_email : false,
    contacted_phone: contacted ? value.contacted_phone : false,
    contacted_visit: contacted ? value.contacted_visit : false,
  };
}

function QuoteSheetRow({ value, onChange, disabled, trailing }) {
  return (
    <tr>
      {COLS.map((col) => {
        if (col.type === "check") {
          return (
            <td key={col.key} style={checkCellStyle}>
              <input
                type="checkbox"
                checked={Boolean(value.contacted)}
                disabled={disabled}
                onChange={(e) => onChange(applyContactedToggle(value, e.target.checked))}
                aria-label="Contacted"
              />
            </td>
          );
        }
        if (col.type === "subcheck") {
          return (
            <td key={col.key} style={checkCellStyle}>
              <input
                type="checkbox"
                checked={Boolean(value[col.key])}
                disabled={disabled || !value.contacted}
                onChange={(e) => onChange({ ...value, [col.key]: e.target.checked })}
                aria-label={col.label}
              />
            </td>
          );
        }
        return (
          <td key={col.key} style={tdStyle}>
            <input
              type={col.type}
              inputMode={col.key === "phone" ? "numeric" : undefined}
              value={value[col.key] || ""}
              disabled={disabled}
              onChange={(e) => {
                let next = e.target.value;
                if (col.key === "phone") next = next.replace(/[^\d+\s()-]/g, "");
                onChange({ ...value, [col.key]: next });
              }}
              style={cellInputStyle}
            />
          </td>
        );
      })}
      <td
        style={{
          ...tdStyle,
          padding: "4px 6px",
          whiteSpace: "nowrap",
          width: "1%",
        }}
      >
        {trailing}
      </td>
    </tr>
  );
}

/** Sales-only quotes list — Excel-style single-line rows. */
export default function NewPage() {
  const location = useLocation();
  const logo = useAppLogo();
  const [isAdmin, setIsAdmin] = useState(false);
  const [quotes, setQuotes] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [edits, setEdits] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const admin = await isUserAdmin();
      if (!cancelled) setIsAdmin(admin);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadQuotes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_URL}/api/quotes`, { headers: getApiHeaders() });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      const list = Array.isArray(data) ? data : [];
      setQuotes(list);
      const nextEdits = {};
      for (const q of list) {
        nextEdits[q.id] = {
          suburb: q.suburb || "",
          street: q.street || "",
          name: q.name || "",
          email: q.email || "",
          phone: q.phone || "",
          contacted: Boolean(q.contacted),
          contacted_email: Boolean(q.contacted_email),
          contacted_phone: Boolean(q.contacted_phone),
          contacted_visit: Boolean(q.contacted_visit),
        };
      }
      setEdits(nextEdits);
    } catch (err) {
      setError(err.message || "Failed to load quotes");
      setQuotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQuotes();
  }, [loadQuotes]);

  async function handleAdd(e) {
    e?.preventDefault?.();
    try {
      setSavingId("new");
      setError(null);
      const res = await fetch(`${API_URL}/api/quotes`, {
        method: "POST",
        headers: getApiHeaders(),
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setDraft(emptyDraft());
      await loadQuotes();
    } catch (err) {
      alert(err.message || "Failed to add quote");
    } finally {
      setSavingId(null);
    }
  }

  async function handleSave(id) {
    const body = edits[id];
    if (!body) return;
    try {
      setSavingId(id);
      setError(null);
      const res = await fetch(`${API_URL}/api/quotes/${id}`, {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setQuotes((prev) => prev.map((q) => (q.id === id ? data : q)));
      setEdits((prev) => ({
        ...prev,
        [id]: {
          suburb: data.suburb || "",
          street: data.street || "",
          name: data.name || "",
          email: data.email || "",
          phone: data.phone || "",
          contacted: Boolean(data.contacted),
          contacted_email: Boolean(data.contacted_email),
          contacted_phone: Boolean(data.contacted_phone),
          contacted_visit: Boolean(data.contacted_visit),
        },
      }));
    } catch (err) {
      alert(err.message || "Failed to save quote");
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id) {
    const row = edits[id];
    const label = [row?.suburb, row?.street, row?.name].filter(Boolean).join(" · ") || "this quote";
    if (!window.confirm(`Delete quote “${label}”?`)) return;
    try {
      setSavingId(id);
      setError(null);
      const res = await fetch(`${API_URL}/api/quotes/${id}`, {
        method: "DELETE",
        headers: getApiHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setQuotes((prev) => prev.filter((q) => q.id !== id));
      setEdits((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      alert(err.message || "Failed to delete quote");
    } finally {
      setSavingId(null);
    }
  }

  const busy = savingId != null;

  return (
    <div
      className="page-container"
      style={{
        position: "fixed",
        inset: 0,
        background: LIGHT_MONUMENT,
        minHeight: "100vh",
        width: "100vw",
      }}
    >
      <div
        style={{
          margin: "32px auto 14px auto",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          display: "flex",
          alignItems: "center",
          padding: "0 32px",
          boxSizing: "border-box",
          justifyContent: "center",
          position: "relative",
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
          Quotes
        </h1>
      </div>

      <div
        className="sections-container"
        style={{
          display: "flex",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          marginLeft: "auto",
          marginRight: "auto",
          gap: "32px",
          paddingBottom: "32px",
          boxSizing: "border-box",
        }}
      >
        <div
          className="sidebar-menu"
          style={{
            background: SECTION_GREY,
            borderRadius: "16px",
            width: "200px",
            minWidth: "200px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
            padding: "32px 12px",
            boxSizing: "border-box",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            gap: "18px",
            color: MONUMENT,
            alignSelf: "flex-start",
          }}
        >
          <HotlistSidebarSection />
          <ProjectStatusSidebarSection activePath={location.pathname} />
          <ManagersSalesMenuGroup />
          <AdminToolsSidebarSection activePath={location.pathname} visible={isAdmin} />
          <div style={{ flex: 1 }} />
        </div>

        <div
          className="content-section"
          style={{
            background: SECTION_GREY,
            borderRadius: "18px",
            flex: 1,
            minWidth: 0,
            minHeight: "60vh",
            boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
            padding: "20px 22px",
            boxSizing: "border-box",
            color: MONUMENT,
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <p style={{ margin: 0, fontSize: "0.85rem", color: UI.textMuted }}>
            Quotes only — not projects. Contact method columns unlock when Contacted is ticked.
          </p>

          {loading ? (
            <div style={{ fontSize: "1rem" }}>Loading…</div>
          ) : error ? (
            <div style={{ color: "#cc3333", fontSize: "1rem" }}>Error: {error}</div>
          ) : (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflow: "auto",
                border: cellBorder,
                background: WHITE,
                borderRadius: "4px",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  tableLayout: "fixed",
                }}
              >
                <colgroup>
                  {COLS.map((col) => (
                    <col key={col.key} style={{ width: col.width }} />
                  ))}
                  <col style={{ width: "110px" }} />
                </colgroup>
                <thead>
                  <tr>
                    {COLS.map((col) => (
                      <th key={col.key} style={thStyle}>
                        {col.type === "subcheck" ? (
                          <span style={{ fontWeight: 600 }} title="Requires Contacted">
                            {col.label}
                          </span>
                        ) : (
                          col.label
                        )}
                      </th>
                    ))}
                    <th style={{ ...thStyle, textAlign: "center" }}> </th>
                  </tr>
                </thead>
                <tbody>
                  <QuoteSheetRow
                    value={draft}
                    onChange={setDraft}
                    disabled={busy}
                    trailing={
                      <button
                        type="button"
                        disabled={busy}
                        onClick={handleAdd}
                        style={actionBtnStyle}
                      >
                        {savingId === "new" ? "Adding…" : "Add"}
                      </button>
                    }
                  />
                  {quotes.length === 0 ? (
                    <tr>
                      <td
                        colSpan={COLS.length + 1}
                        style={{
                          ...tdStyle,
                          padding: "12px 8px",
                          color: UI.textMuted,
                          fontSize: "0.9rem",
                        }}
                      >
                        No quotes yet — fill the top row and click Add.
                      </td>
                    </tr>
                  ) : (
                    quotes.map((quote) => {
                      const value = edits[quote.id] || emptyDraft();
                      return (
                        <QuoteSheetRow
                          key={quote.id}
                          value={value}
                          disabled={busy}
                          onChange={(next) => setEdits((prev) => ({ ...prev, [quote.id]: next }))}
                          trailing={
                            <div style={{ display: "inline-flex", gap: "4px" }}>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleSave(quote.id)}
                                style={actionBtnStyle}
                              >
                                {savingId === quote.id ? "…" : "Save"}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleDelete(quote.id)}
                                style={actionBtnStyle}
                              >
                                Del
                              </button>
                            </div>
                          }
                        />
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
