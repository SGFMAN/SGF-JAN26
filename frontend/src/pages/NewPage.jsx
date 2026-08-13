import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import HotlistSidebarSection from "../components/HotlistSidebarSection";
import ProjectStatusSidebarSection from "../components/ProjectStatusSidebarSection";
import AdminToolsSidebarSection from "../components/AdminToolsSidebarSection";
import ManagersSalesMenuGroup from "../components/ManagersSalesMenuGroup";
import ModalBackdrop from "../components/ModalBackdrop";
import { getApiHeaders, isUserAdmin } from "../utils/auth";
import useAppLogo from "../hooks/useAppLogo.js";
import { parseAustralianAddress, STATE_OPTIONS } from "../utils/parseAustralianAddress.js";
import { UI } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const GRID_LINE = "#c5c9ce";
const HEADER_BG = "#e8eaed";
const API_URL = "";

const emptyQuote = () => ({
  created_at: null,
  state: "",
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
  { key: "created_at", label: "Date added", type: "date", width: "96px" },
  { key: "state", label: "State", type: "state", width: "72px" },
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

const modalInputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "8px",
  border: "none",
  fontSize: "1rem",
  color: MONUMENT,
  background: WHITE,
  boxSizing: "border-box",
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

function formatQuoteDateAdded(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function isQuoteDateOlderThanThreeDays(value) {
  if (!value) return false;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const ageMs = Date.now() - d.getTime();
  return ageMs > 3 * 24 * 60 * 60 * 1000;
}

function quoteFromApi(q) {
  const stateRaw = String(q?.state ?? "").trim().toUpperCase();
  return {
    created_at: q.created_at || null,
    state: STATE_OPTIONS.includes(stateRaw) ? stateRaw : stateRaw,
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

function QuoteSheetRow({ value, onChange, disabled, trailing }) {
  const stateValue = STATE_OPTIONS.includes(String(value.state || "").trim().toUpperCase())
    ? String(value.state).trim().toUpperCase()
    : "";
  return (
    <tr>
      {COLS.map((col) => {
        if (col.type === "date") {
          const stale = isQuoteDateOlderThanThreeDays(value.created_at);
          return (
            <td
              key={col.key}
              style={{
                ...tdStyle,
                padding: "6px 8px",
                fontSize: "0.85rem",
                color: stale ? "#cc3333" : MONUMENT,
                fontWeight: stale ? 700 : 400,
                whiteSpace: "nowrap",
                minWidth: 96,
              }}
            >
              {formatQuoteDateAdded(value.created_at)}
            </td>
          );
        }
        if (col.type === "state") {
          return (
            <td key={col.key} style={{ ...tdStyle, minWidth: 72 }}>
              <select
                value={stateValue}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, state: e.target.value }, { immediate: true })}
                style={{
                  ...cellInputStyle,
                  minWidth: 64,
                  cursor: disabled ? "default" : "pointer",
                  color: stateValue ? MONUMENT : UI.textMuted,
                  fontWeight: stateValue ? 700 : 400,
                }}
                aria-label="State"
              >
                <option value="">—</option>
                {STATE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </td>
          );
        }
        if (col.type === "check") {
          return (
            <td key={col.key} style={checkCellStyle}>
              <input
                type="checkbox"
                checked={Boolean(value.contacted)}
                disabled={disabled}
                onChange={(e) => onChange(applyContactedToggle(value, e.target.checked), { immediate: true })}
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
                onChange={(e) => onChange({ ...value, [col.key]: e.target.checked }, { immediate: true })}
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
                if (col.key === "street" || col.key === "suburb") next = next.replace(/[/\\]/g, "_");
                onChange({ ...value, [col.key]: next });
              }}
              style={cellInputStyle}
            />
          </td>
        );
      })}
      {trailing ? (
        <td style={{ ...tdStyle, padding: "4px 6px", whiteSpace: "nowrap", width: "1%" }}>{trailing}</td>
      ) : null}
    </tr>
  );
}

/** Sales-only quotes (projects with status Quote) — Excel-style rows; paste address to add. */
export default function NewPage() {
  const location = useLocation();
  const logo = useAppLogo();
  const pasteRef = useRef(null);
  const saveTimersRef = useRef({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [quotes, setQuotes] = useState([]);
  const [edits, setEdits] = useState({});
  const [pasteBox, setPasteBox] = useState("");
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [addressForm, setAddressForm] = useState({ state: "", street: "", suburb: "" });
  const [rawPaste, setRawPaste] = useState("");
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

  useEffect(() => {
    return () => {
      Object.values(saveTimersRef.current).forEach((t) => clearTimeout(t));
      saveTimersRef.current = {};
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
      for (const q of list) nextEdits[q.id] = quoteFromApi(q);
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

  const persistQuote = useCallback(async (id, body) => {
    try {
      setSavingId(id);
      const res = await fetch(`${API_URL}/api/quotes/${id}`, {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      const normalised = quoteFromApi(data);
      setQuotes((prev) => prev.map((q) => (q.id === id ? data : q)));
      setEdits((prev) => ({ ...prev, [id]: normalised }));
    } catch (err) {
      console.error("Quote autosave failed:", err);
    } finally {
      setSavingId((current) => (current === id ? null : current));
    }
  }, []);

  function handleRowChange(id, next, { immediate = false } = {}) {
    setEdits((prev) => ({ ...prev, [id]: next }));
    if (saveTimersRef.current[id]) clearTimeout(saveTimersRef.current[id]);
    if (immediate) {
      void persistQuote(id, next);
      return;
    }
    saveTimersRef.current[id] = setTimeout(() => {
      void persistQuote(id, next);
    }, 400);
  }

  function openAddressModalFromPaste(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return;
    const parsed = parseAustralianAddress(trimmed);
    setRawPaste(trimmed);
    setAddressForm({
      state: parsed.state || "",
      street: parsed.street || "",
      suburb: parsed.suburb || "",
    });
    setAddressModalOpen(true);
    setPasteBox("");
  }

  function handlePasteBoxPaste(e) {
    const text = e.clipboardData?.getData("text") ?? "";
    if (!String(text).trim()) return;
    e.preventDefault();
    openAddressModalFromPaste(text);
  }

  function handlePasteBoxKeyDown(e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    openAddressModalFromPaste(pasteBox);
  }

  function closeAddressModal() {
    setAddressModalOpen(false);
    setRawPaste("");
    setAddressForm({ state: "", street: "", suburb: "" });
    requestAnimationFrame(() => pasteRef.current?.focus());
  }

  async function handleConfirmAddress() {
    const state = String(addressForm.state || "").trim().toUpperCase();
    const street = String(addressForm.street || "").trim();
    const suburb = String(addressForm.suburb || "").trim();
    if (!street) {
      alert("Please enter street");
      return;
    }
    if (!suburb) {
      alert("Please enter suburb");
      return;
    }
    if (!STATE_OPTIONS.includes(state)) {
      alert("Please select state (VIC or QLD)");
      return;
    }
    try {
      setSavingId("new");
      setError(null);
      const res = await fetch(`${API_URL}/api/quotes`, {
        method: "POST",
        headers: getApiHeaders(),
        body: JSON.stringify({
          ...emptyQuote(),
          state,
          street,
          suburb,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      // Prefer create response; keep modal state if API omitted it.
      const row = {
        ...data,
        state: data.state || state,
        street: data.street || street,
        suburb: data.suburb || suburb,
      };
      const normalised = quoteFromApi(row);
      if (row.id != null) {
        setQuotes((prev) => [row, ...prev.filter((q) => q.id !== row.id)]);
        setEdits((prev) => ({ ...prev, [row.id]: normalised }));
      }
      closeAddressModal();
    } catch (err) {
      alert(err.message || "Failed to add quote");
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id) {
    const row = edits[id];
    const label = [row?.suburb, row?.street, row?.name].filter(Boolean).join(" · ") || "this quote";
    if (!window.confirm(`Delete quote “${label}”?`)) return;
    if (saveTimersRef.current[id]) {
      clearTimeout(saveTimersRef.current[id]);
      delete saveTimersRef.current[id];
    }
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

  const busy = savingId === "new";

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
          <div
            style={{
              background: WHITE,
              borderRadius: "10px",
              border: `1px dashed #aaa`,
              padding: "12px 14px",
            }}
          >
            <label
              style={{
                display: "block",
                fontSize: "0.9rem",
                fontWeight: 600,
                color: MONUMENT,
                marginBottom: "8px",
              }}
            >
              Paste address
            </label>
            <input
              ref={pasteRef}
              type="text"
              value={pasteBox}
              disabled={busy}
              placeholder="e.g. 12 Ocean Ave, Bondi, QLD 2026"
              onChange={(e) => setPasteBox(e.target.value)}
              onPaste={handlePasteBoxPaste}
              onKeyDown={handlePasteBoxKeyDown}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: `1px solid ${GRID_LINE}`,
                fontSize: "1rem",
                background: "#f6f6f7",
                color: MONUMENT,
                boxSizing: "border-box",
              }}
              autoComplete="off"
            />
            <div style={{ marginTop: "6px", fontSize: "0.8rem", color: UI.textMuted }}>
              Paste an address to split into State, Street and Suburb.
            </div>
          </div>

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
                  <col style={{ width: "56px" }} />
                </colgroup>
                <thead>
                  <tr>
                    {COLS.map((col) => (
                      <th key={col.key} style={thStyle}>
                        {col.label}
                      </th>
                    ))}
                    <th style={{ ...thStyle, textAlign: "center", width: 56 }}> </th>
                  </tr>
                </thead>
                <tbody>
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
                        No quotes yet — paste an address above.
                      </td>
                    </tr>
                  ) : (
                    quotes.map((quote) => {
                      const value = edits[quote.id] || emptyQuote();
                      return (
                        <QuoteSheetRow
                          key={quote.id}
                          value={value}
                          disabled={busy}
                          onChange={(next, opts) => handleRowChange(quote.id, next, opts)}
                          trailing={
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleDelete(quote.id)}
                              style={actionBtnStyle}
                            >
                              Del
                            </button>
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

      {addressModalOpen ? (
        <ModalBackdrop zIndex={1000} onClick={closeAddressModal}>
          <div
            role="dialog"
            aria-modal="true"
            style={{
              background: SECTION_GREY,
              borderRadius: "18px",
              padding: "32px",
              width: "90%",
              maxWidth: "500px",
              boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: "1.5rem",
                fontWeight: 600,
                marginTop: 0,
                marginBottom: "8px",
                color: MONUMENT,
              }}
            >
              Quote address
            </h2>
            {rawPaste ? (
              <p style={{ margin: "0 0 20px 0", fontSize: "0.85rem", color: UI.textMuted }}>
                Pasted: {rawPaste}
              </p>
            ) : null}

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                State
              </label>
              <select
                value={STATE_OPTIONS.includes(String(addressForm.state || "").toUpperCase())
                  ? String(addressForm.state).toUpperCase()
                  : ""}
                onChange={(e) => setAddressForm((prev) => ({ ...prev, state: e.target.value }))}
                style={{
                  ...modalInputStyle,
                  color: addressForm.state ? MONUMENT : UI.textMuted,
                  cursor: "pointer",
                }}
              >
                <option value="">Select…</option>
                {STATE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                Street
              </label>
              <input
                type="text"
                value={addressForm.street}
                onChange={(e) =>
                  setAddressForm((prev) => ({
                    ...prev,
                    street: e.target.value.replace(/[/\\]/g, "_"),
                  }))
                }
                style={modalInputStyle}
                autoComplete="off"
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                Suburb
              </label>
              <input
                type="text"
                value={addressForm.suburb}
                onChange={(e) =>
                  setAddressForm((prev) => ({
                    ...prev,
                    suburb: e.target.value.replace(/[/\\]/g, "_"),
                  }))
                }
                style={modalInputStyle}
                autoComplete="off"
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
              <button
                type="button"
                onClick={closeAddressModal}
                disabled={busy}
                style={{
                  background: UI.inputBg,
                  color: MONUMENT,
                  border: "none",
                  borderRadius: "10px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAddress}
                disabled={busy}
                style={{
                  background: MONUMENT,
                  color: PAGE_TEXT,
                  border: "none",
                  borderRadius: "10px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {savingId === "new" ? "Adding…" : "Add quote"}
              </button>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}
    </div>
  );
}
