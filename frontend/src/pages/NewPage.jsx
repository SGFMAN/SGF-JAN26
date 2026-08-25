import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import MainSidebarMenu from "../components/MainSidebarMenu";
import ModalBackdrop from "../components/ModalBackdrop";
import NewProject2 from "./NewProject_2_ClientDetails";
import QuoteCallbackLists from "./QuoteCallbackLists";
import { getApiHeaders } from "../utils/auth";
import useAppLogo from "../hooks/useAppLogo.js";
import { parseAustralianAddress, STATE_OPTIONS } from "../utils/parseAustralianAddress.js";
import { buildSavedButtonStyle, ensureUiButtonStylesLoaded } from "../utils/uiButtonStyles.js";
import { UI, STREAM } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const GRID_LINE = "#c5c9ce";
const HEADER_BG = "#e8eaed";
const API_URL = "";
const QUOTE_DELETE_BUTTON_ID = 2;
const QUOTE_HOTLIST_BUTTON_ID = 3;

const emptyQuote = () => ({
  created_at: null,
  state: "",
  suburb: "",
  street: "",
  name: "",
  email: "",
  phone: "",
  active: true,
  contact: false,
  reminder_1_sent_at: null,
  reminder_2_sent_at: null,
  reminder_3_sent_at: null,
  reminder_4_sent_at: null,
});

const COLS = [
  { key: "created_at", label: "Date added", type: "date", width: "100px" },
  { key: "state", label: "State", type: "state", width: "auto" },
  { key: "suburb", label: "Suburb", type: "text", width: "12%" },
  { key: "street", label: "Street", type: "text", width: "16%" },
  { key: "name", label: "Name", type: "text", width: "12%" },
  { key: "email", label: "Email", type: "email", width: "16%" },
  { key: "phone", label: "Phone", type: "tel", width: "auto" },
  { key: "active", label: "Active", type: "activeCheck", width: "52px" },
  { key: "reminder_1_sent_at", label: "1", type: "reminderSent", width: "36px" },
  { key: "reminder_2_sent_at", label: "2", type: "reminderSent", width: "36px" },
  { key: "reminder_3_sent_at", label: "3", type: "reminderSent", width: "36px" },
  { key: "reminder_4_sent_at", label: "4", type: "reminderSent", width: "36px" },
  { key: "contact", label: "Contact", type: "contactCheck", width: "68px" },
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

const cellTextStyle = {
  padding: "6px 8px",
  fontSize: "0.85rem",
  color: MONUMENT,
  boxSizing: "border-box",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const checkCellStyle = {
  ...tdStyle,
  textAlign: "center",
  padding: "4px 2px",
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

function formatQuoteDateAdded(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatQuoteDateTime(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  return `${formatQuoteDateAdded(value)} ${time}`;
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
    active: q.active !== false,
    contact: q.contact === true,
    reminder_1_sent_at: q.reminder_1_sent_at || null,
    reminder_2_sent_at: q.reminder_2_sent_at || null,
    reminder_3_sent_at: q.reminder_3_sent_at || null,
    reminder_4_sent_at: q.reminder_4_sent_at || null,
  };
}

/** Keep the current row order. New quotes go on top; checkboxes never reshuffle. */
function mergeQuoteListPreservingOrder(prev, incoming) {
  const byId = new Map((incoming || []).map((q) => [q.id, q]));
  const kept = [];
  const seen = new Set();
  for (const q of prev || []) {
    const next = byId.get(q.id);
    if (!next) continue;
    kept.push(next);
    seen.add(q.id);
  }
  const added = [];
  for (const q of incoming || []) {
    if (!seen.has(q.id)) added.push(q);
  }
  return [...added, ...kept];
}

function quoteMatchesSearch(value, query) {
  const raw = String(query || "").trim();
  if (!raw) return true;
  const lower = raw.toLowerCase();
  const digits = raw.replace(/\D/g, "");
  const name = String(value?.name || "").toLowerCase();
  const email = String(value?.email || "").toLowerCase();
  const street = String(value?.street || "").toLowerCase();
  const suburb = String(value?.suburb || "").toLowerCase();
  const state = String(value?.state || "").toLowerCase();
  const phone = String(value?.phone || "");
  const phoneDigits = phone.replace(/\D/g, "");
  const address = [street, suburb, state].filter(Boolean).join(" ");
  if (name.includes(lower) || email.includes(lower) || street.includes(lower) || suburb.includes(lower) || state.includes(lower) || address.includes(lower) || phone.toLowerCase().includes(lower)) {
    return true;
  }
  if (digits.length >= 2 && phoneDigits.includes(digits)) return true;
  return false;
}

function quoteHotlistButtonStyle() {
  const saved = buildSavedButtonStyle(QUOTE_HOTLIST_BUTTON_ID, true);
  const fallback = {
    background: MONUMENT,
    color: PAGE_TEXT,
    border: `1px solid ${MONUMENT}`,
    borderRadius: "6px",
    fontWeight: 600,
  };
  return {
    ...(saved || fallback),
    width: "auto",
    minWidth: "110px",
    height: "auto",
    padding: "4px 8px",
    fontSize: (saved && saved.fontSize) || "0.75rem",
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxSizing: "border-box",
    lineHeight: 1.2,
  };
}

function quoteModalDeleteButtonStyle() {
  const saved = buildSavedButtonStyle(QUOTE_DELETE_BUTTON_ID, true);
  const fallback = {
    background: MONUMENT,
    color: PAGE_TEXT,
    border: "none",
    borderRadius: "10px",
    fontWeight: 500,
  };
  return {
    ...(saved || fallback),
    width: "auto",
    height: "auto",
    padding: "10px 20px",
    fontSize: "1rem",
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxSizing: "border-box",
  };
}

function QuoteSheetRow({ value, disabled, onActiveChange, onContactChange, trailing, onRowClick }) {
  const stateValue = STATE_OPTIONS.includes(String(value.state || "").trim().toUpperCase())
    ? String(value.state).trim().toUpperCase()
    : "";
  return (
    <tr
      className="quote-sheet-row"
      onClick={disabled ? undefined : onRowClick}
    >
      {COLS.map((col) => {
        if (col.type === "date") {
          return (
            <td
              key={col.key}
              style={{
                ...tdStyle,
                ...cellTextStyle,
                minWidth: 100,
              }}
            >
              {formatQuoteDateAdded(value.created_at)}
            </td>
          );
        }
        if (col.type === "state") {
          return (
            <td
              key={col.key}
              style={{
                ...tdStyle,
                ...cellTextStyle,
                width: "1%",
                whiteSpace: "nowrap",
                fontWeight: stateValue ? 700 : 400,
                color: stateValue ? MONUMENT : UI.textMuted,
              }}
            >
              {stateValue || "—"}
            </td>
          );
        }
        if (col.type === "activeCheck") {
          return (
            <td key={col.key} style={checkCellStyle} onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={value.active !== false}
                disabled={disabled}
                aria-label="Active"
                onChange={(e) => onActiveChange?.(e.target.checked)}
              />
            </td>
          );
        }
        if (col.type === "contactCheck") {
          return (
            <td key={col.key} style={checkCellStyle} onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={value.contact === true}
                disabled={disabled}
                aria-label="Contact"
                onChange={(e) => onContactChange?.(e.target.checked)}
              />
            </td>
          );
        }
        if (col.type === "reminderSent") {
          const sentAt = value[col.key];
          const sent = Boolean(sentAt);
          const n = Number(String(col.key).replace(/\D/g, "")) || 1;
          return (
            <td key={col.key} style={checkCellStyle}>
              <input
                type="checkbox"
                checked={sent}
                disabled
                readOnly
                tabIndex={-1}
                aria-label={sent ? `Reminder ${n} sent` : `Reminder ${n} not sent`}
                title={sent ? `Reminder ${n} sent ${formatQuoteDateTime(sentAt)}` : `Reminder ${n} not sent`}
                style={{ pointerEvents: "none", opacity: 1, cursor: "default", accentColor: MONUMENT }}
              />
            </td>
          );
        }
        return (
          <td
            key={col.key}
            style={{
              ...tdStyle,
              ...cellTextStyle,
              ...(col.width === "auto" ? { width: "1%", whiteSpace: "nowrap" } : null),
            }}
            title={value[col.key] || ""}
          >
            {value[col.key] || ""}
          </td>
        );
      })}
      {trailing ? (
        <td
          style={{ ...tdStyle, padding: "4px 6px 4px 4px", whiteSpace: "nowrap", width: "1%" }}
          onClick={(e) => e.stopPropagation()}
        >
          {trailing}
        </td>
      ) : null}
    </tr>
  );
}

/** Sales-only quotes (projects with status Quote) — Excel-style rows; paste address to add. */
export default function NewPage() {
  const location = useLocation();
  const logo = useAppLogo();
  const pasteRef = useRef(null);
  const searchRef = useRef(null);
  const [quotes, setQuotes] = useState([]);
  const [edits, setEdits] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [pasteBox, setPasteBox] = useState("");
  const [newQuotePasteOpen, setNewQuotePasteOpen] = useState(false);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [addressForm, setAddressForm] = useState({ state: "", street: "", suburb: "" });
  const [rawPaste, setRawPaste] = useState("");
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [clientForm, setClientForm] = useState({ clientName: "", email: "", phone: "" });
  const [editingQuoteId, setEditingQuoteId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState(null);
  const [showCallbackLists, setShowCallbackLists] = useState(false);
  const [, setUiButtonStyleRevision] = useState(0);

  useEffect(() => {
    void ensureUiButtonStylesLoaded();
    const refresh = () => setUiButtonStyleRevision((n) => n + 1);
    window.addEventListener("sgf-ui-button-styles-change", refresh);
    window.addEventListener("sgf-ui-theme-change", refresh);
    return () => {
      window.removeEventListener("sgf-ui-button-styles-change", refresh);
      window.removeEventListener("sgf-ui-theme-change", refresh);
    };
  }, []);

  const loadQuotes = useCallback(async ({ silent } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      const res = await fetch(`${API_URL}/api/quotes`, { headers: getApiHeaders() });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      const list = Array.isArray(data) ? data : [];
      setQuotes((prev) => (silent ? mergeQuoteListPreservingOrder(prev, list) : list));
      const nextEdits = {};
      for (const q of list) nextEdits[q.id] = quoteFromApi(q);
      setEdits(nextEdits);
    } catch (err) {
      if (!silent) {
        setError(err.message || "Failed to load quotes");
        setQuotes([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQuotes();
  }, [loadQuotes]);

  useEffect(() => {
    const timer = setInterval(() => {
      void loadQuotes({ silent: true });
    }, 20000);
    return () => clearInterval(timer);
  }, [loadQuotes]);

  useEffect(() => {
    if (!newQuotePasteOpen) return;
    requestAnimationFrame(() => pasteRef.current?.focus());
  }, [newQuotePasteOpen]);

  const filteredQuotes = useMemo(
    () => quotes.filter((quote) => quoteMatchesSearch(edits[quote.id] || quote, searchQuery)),
    [quotes, edits, searchQuery]
  );

  function openNewQuotePasteModal() {
    setPasteBox("");
    setNewQuotePasteOpen(true);
  }

  function closeNewQuotePasteModal() {
    setNewQuotePasteOpen(false);
    setPasteBox("");
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
    setNewQuotePasteOpen(false);
    setPasteBox("");
    setAddressModalOpen(true);
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

  function cancelQuoteModalFlow() {
    setClientModalOpen(false);
    setClientForm({ clientName: "", email: "", phone: "" });
    setAddressModalOpen(false);
    setEditingQuoteId(null);
    setRawPaste("");
    setAddressForm({ state: "", street: "", suburb: "" });
  }

  function openEditQuote(quoteId) {
    const q = edits[quoteId] || emptyQuote();
    setEditingQuoteId(quoteId);
    setRawPaste("");
    setAddressForm({
      state: String(q.state || "").trim().toUpperCase(),
      street: q.street || "",
      suburb: q.suburb || "",
    });
    setClientForm({
      clientName: q.name || "",
      email: q.email || "",
      phone: q.phone || "",
    });
    setAddressModalOpen(true);
  }

  function handleConfirmAddress() {
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
    setAddressForm({ state, street, suburb });
    setAddressModalOpen(false);
    if (editingQuoteId == null) {
      setClientForm({ clientName: "", email: "", phone: "" });
    }
    setClientModalOpen(true);
  }

  function handleClientModalBack() {
    setClientModalOpen(false);
    setAddressModalOpen(true);
  }

  async function handleClientModalNext() {
    const state = String(addressForm.state || "").trim().toUpperCase();
    const street = String(addressForm.street || "").trim();
    const suburb = String(addressForm.suburb || "").trim();
    const name = String(clientForm.clientName || "").trim();
    const email = String(clientForm.email || "").trim();
    const phone = String(clientForm.phone || "").replace(/\D/g, "");
    if (!street || !suburb || !STATE_OPTIONS.includes(state)) {
      alert("Address is incomplete. Please go back and check State, Street and Suburb.");
      return;
    }

    const isEdit = editingQuoteId != null;
    const existing = isEdit ? edits[editingQuoteId] || emptyQuote() : emptyQuote();

    try {
      setSavingId(isEdit ? editingQuoteId : "new");
      setError(null);
      const payload = {
        ...existing,
        state,
        street,
        suburb,
        name,
        email,
        phone,
        ...(isEdit ? {} : { active: true, contact: false }),
      };
      const res = await fetch(
        isEdit ? `${API_URL}/api/quotes/${editingQuoteId}` : `${API_URL}/api/quotes`,
        {
          method: isEdit ? "PUT" : "POST",
          headers: getApiHeaders(),
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      const row = {
        ...data,
        state: data.state || state,
        street: data.street || street,
        suburb: data.suburb || suburb,
        name: data.name || name,
        email: data.email || email,
        phone: data.phone || phone,
      };
      const normalised = quoteFromApi(row);
      if (row.id != null) {
        if (isEdit) {
          setQuotes((prev) => prev.map((q) => (q.id === row.id ? row : q)));
        } else {
          setQuotes((prev) => [row, ...prev.filter((q) => q.id !== row.id)]);
        }
        setEdits((prev) => ({ ...prev, [row.id]: normalised }));
      }
      cancelQuoteModalFlow();
    } catch (err) {
      alert(err.message || (isEdit ? "Failed to update quote" : "Failed to add quote"));
    } finally {
      setSavingId(null);
    }
  }

  async function handleAddToHotlist(id) {
    const row = edits[id];
    const label = [row?.suburb, row?.street, row?.name].filter(Boolean).join(" · ") || "this quote";
    if (!window.confirm(`Add “${label}” to Hotlist?`)) return;
    try {
      setSavingId(id);
      setError(null);
      const res = await fetch(`${API_URL}/api/quotes/${id}/add-to-hotlist`, {
        method: "POST",
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
      alert(err.message || "Failed to add quote to hotlist");
    } finally {
      setSavingId(null);
    }
  }

  async function handleDeleteQuote(id) {
    const row = edits[id];
    const label = [row?.suburb, row?.street, row?.name].filter(Boolean).join(" · ") || "this quote";
    if (!window.confirm(`Delete “${label}”? This cannot be undone.`)) return;
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
      cancelQuoteModalFlow();
    } catch (err) {
      alert(err.message || "Failed to delete quote");
    } finally {
      setSavingId(null);
    }
  }

  async function handleToggleQuoteActive(id, nextActive) {
    const previous = edits[id]?.active !== false;
    setEdits((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || emptyQuote()), active: nextActive },
    }));
    setQuotes((prev) => prev.map((q) => (q.id === id ? { ...q, active: nextActive } : q)));
    try {
      const res = await fetch(`${API_URL}/api/quotes/${id}/active`, {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify({ active: nextActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      const normalised = quoteFromApi(data);
      setEdits((prev) => ({ ...prev, [id]: { ...(prev[id] || emptyQuote()), ...normalised } }));
      setQuotes((prev) => prev.map((q) => (q.id === id ? { ...q, active: normalised.active } : q)));
    } catch (err) {
      setEdits((prev) => ({
        ...prev,
        [id]: { ...(prev[id] || emptyQuote()), active: previous },
      }));
      setQuotes((prev) => prev.map((q) => (q.id === id ? { ...q, active: previous } : q)));
      alert(err.message || "Failed to update Active");
    }
  }

  async function handleToggleQuoteContact(id, nextContact) {
    const previous = edits[id]?.contact === true;
    setEdits((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || emptyQuote()), contact: nextContact },
    }));
    setQuotes((prev) => prev.map((q) => (q.id === id ? { ...q, contact: nextContact } : q)));
    try {
      const res = await fetch(`${API_URL}/api/quotes/${id}/contact`, {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify({ contact: nextContact }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      const normalised = quoteFromApi(data);
      setEdits((prev) => ({ ...prev, [id]: { ...(prev[id] || emptyQuote()), ...normalised } }));
      setQuotes((prev) => prev.map((q) => (q.id === id ? { ...q, contact: normalised.contact } : q)));
    } catch (err) {
      setEdits((prev) => ({
        ...prev,
        [id]: { ...(prev[id] || emptyQuote()), contact: previous },
      }));
      setQuotes((prev) => prev.map((q) => (q.id === id ? { ...q, contact: previous } : q)));
      alert(err.message || "Failed to update Contact");
    }
  }

  const busy = savingId === "new" || (editingQuoteId != null && savingId === editingQuoteId);

  return (
    <div
      className="page-container project-list-page"
      style={{
        position: "fixed",
        inset: 0,
        background: LIGHT_MONUMENT,
        minHeight: "100vh",
        width: "100vw",
      }}
    >
      <style>{`
        .project-list-page tr.quote-sheet-row {
          cursor: pointer;
        }
        .project-list-page tr.quote-sheet-row:hover td {
          background: ${STREAM.vicBlue} !important;
        }
      `}</style>
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
          <MainSidebarMenu activePath={location.pathname} />
          <div style={{ flex: 1 }} />
        </div>

        <div
          className="content-section"
          style={{
            background: SECTION_GREY,
            borderRadius: "18px",
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
            padding: "20px 22px",
            boxSizing: "border-box",
            color: MONUMENT,
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "12px",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            {showCallbackLists ? (
              <button
                type="button"
                onClick={() => setShowCallbackLists(false)}
                style={{
                  background: MONUMENT,
                  color: PAGE_TEXT,
                  border: "none",
                  borderRadius: "10px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                Back to Quotes
              </button>
            ) : (
              <>
                <input
                  ref={searchRef}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name, email, address or phone"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: `1px solid ${GRID_LINE}`,
                    fontSize: "1rem",
                    background: WHITE,
                    color: MONUMENT,
                    boxSizing: "border-box",
                  }}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowCallbackLists(true)}
                  style={{
                    background: MONUMENT,
                    color: PAGE_TEXT,
                    border: "none",
                    borderRadius: "10px",
                    padding: "10px 20px",
                    fontSize: "1rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  Call Back Lists
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={openNewQuotePasteModal}
                  style={{
                    background: MONUMENT,
                    color: PAGE_TEXT,
                    border: "none",
                    borderRadius: "10px",
                    padding: "10px 20px",
                    fontSize: "1rem",
                    fontWeight: 500,
                    cursor: busy ? "default" : "pointer",
                    opacity: busy ? 0.6 : 1,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  New Quote
                </button>
              </>
            )}
          </div>

          {showCallbackLists ? (
            <QuoteCallbackLists />
          ) : loading ? (
            <div style={{ fontSize: "1rem" }}>Loading…</div>
          ) : error ? (
            <div style={{ color: "#cc3333", fontSize: "1rem" }}>Error: {error}</div>
          ) : (
            <div
              className="project-list-scroll"
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
                  tableLayout: "auto",
                }}
              >
                <colgroup>
                  {COLS.map((col) => (
                    <col
                      key={col.key}
                      style={col.width && col.width !== "auto" ? { width: col.width } : { width: "1%" }}
                    />
                  ))}
                  <col style={{ width: "1%" }} />
                </colgroup>
                <thead>
                  <tr>
                    {COLS.map((col) => (
                      <th
                        key={col.key}
                        style={{
                          ...thStyle,
                          textAlign:
                            col.type === "activeCheck" ||
                            col.type === "contactCheck" ||
                            col.type === "reminderSent"
                              ? "center"
                              : "left",
                          ...(col.width === "auto" ? { width: "1%", whiteSpace: "nowrap" } : null),
                        }}
                        title={col.type === "reminderSent" ? `Reminder ${col.label}` : undefined}
                      >
                        {col.label}
                      </th>
                    ))}
                    <th style={{ ...thStyle, textAlign: "center", width: "1%", whiteSpace: "nowrap" }}> </th>
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
                        No quotes yet — click New Quote to add one.
                      </td>
                    </tr>
                  ) : filteredQuotes.length === 0 ? (
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
                        No matching quotes.
                      </td>
                    </tr>
                  ) : (
                    filteredQuotes.map((quote) => {
                      const value = edits[quote.id] || emptyQuote();
                      const rowBusy = savingId === quote.id;
                      return (
                        <QuoteSheetRow
                          key={quote.id}
                          value={value}
                          disabled={busy || rowBusy}
                          onActiveChange={(checked) => handleToggleQuoteActive(quote.id, checked)}
                          onContactChange={(checked) => handleToggleQuoteContact(quote.id, checked)}
                          onRowClick={() => openEditQuote(quote.id)}
                          trailing={
                            <div style={{ display: "flex", gap: "6px", alignItems: "center", justifyContent: "flex-start" }}>
                              <button
                                type="button"
                                disabled={busy || rowBusy}
                                onClick={() => handleAddToHotlist(quote.id)}
                                style={{
                                  ...quoteHotlistButtonStyle(),
                                  opacity: busy || rowBusy ? 0.6 : 1,
                                  cursor: busy || rowBusy ? "default" : "pointer",
                                }}
                              >
                                {rowBusy ? "Adding…" : "Add to Hotlist"}
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

      {newQuotePasteOpen ? (
        <ModalBackdrop zIndex={1000}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-quote-paste-title"
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
              id="new-quote-paste-title"
              style={{
                fontSize: "1.5rem",
                fontWeight: 600,
                marginTop: 0,
                marginBottom: "8px",
                color: MONUMENT,
              }}
            >
              New Quote
            </h2>
            <p style={{ margin: "0 0 20px 0", fontSize: "0.85rem", color: UI.textMuted }}>
              Paste an address to split into State, Street and Suburb.
            </p>
            <label
              style={{
                display: "block",
                fontSize: "0.9rem",
                color: UI.textMuted,
                marginBottom: "6px",
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
                ...modalInputStyle,
                background: "#f6f6f7",
                border: `1px solid ${GRID_LINE}`,
              }}
              autoComplete="off"
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
              <button
                type="button"
                onClick={closeNewQuotePasteModal}
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
            </div>
          </div>
        </ModalBackdrop>
      ) : null}

      {addressModalOpen ? (
        <ModalBackdrop zIndex={1000}>
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
              {editingQuoteId != null ? "Edit quote address" : "Quote address"}
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

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginTop: "24px" }}>
              <div>
                {editingQuoteId != null ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteQuote(editingQuoteId)}
                    disabled={busy}
                    style={{
                      ...quoteModalDeleteButtonStyle(),
                      opacity: busy ? 0.6 : 1,
                      cursor: busy ? "default" : "pointer",
                    }}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  type="button"
                  onClick={cancelQuoteModalFlow}
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
                  {savingId === "new" ? "Next…" : "Next"}
                </button>
              </div>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}

      <NewProject2
        isOpen={clientModalOpen}
        onClose={cancelQuoteModalFlow}
        closeOnBackdropClick={false}
        formData={clientForm}
        onFormDataChange={setClientForm}
        onBack={handleClientModalBack}
        onNext={handleClientModalNext}
        onDelete={editingQuoteId != null ? () => handleDeleteQuote(editingQuoteId) : undefined}
        deleteDisabled={busy}
        deleteButtonStyle={quoteModalDeleteButtonStyle()}
        nextLabel={
          savingId === "new" || (editingQuoteId != null && savingId === editingQuoteId)
            ? "Saving…"
            : editingQuoteId != null
              ? "Save"
              : "Save quote"
        }
      />
    </div>
  );
}
