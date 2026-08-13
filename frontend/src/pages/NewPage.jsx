import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import MainSidebarMenu from "../components/MainSidebarMenu";
import ModalBackdrop from "../components/ModalBackdrop";
import { useEmailSendOverlay } from "../components/EmailSendOverlay";
import NewProject2 from "./NewProject_2_ClientDetails";
import { getApiHeaders } from "../utils/auth";
import useAppLogo from "../hooks/useAppLogo.js";
import { parseAustralianAddress, STATE_OPTIONS } from "../utils/parseAustralianAddress.js";
import { replaceLoggedInUserEmailTokens } from "../utils/emailUserTokens";
import { convertEmailBodyNewlinesToBr } from "../utils/emailBodyNewlines";
import { buildSavedButtonStyle, ensureUiButtonStylesLoaded } from "../utils/uiButtonStyles.js";
import { UI } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const GRID_LINE = "#c5c9ce";
const HEADER_BG = "#e8eaed";
const API_URL = "";
const QUOTE_EMAIL_BUTTON_ID = 1;
const QUOTE_HOTLIST_BUTTON_ID = 3;
const QUOTE_EDIT_BUTTON_ID = 5;
const QUOTE_FOLLOWUP_TEMPLATE = "Quote Followup";
const QUOTE_FOLLOWUP_FROM = "info@superiorgrannyflats.com.au";

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
  { key: "email_action", label: "", type: "emailBtn", width: "72px" },
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

function replaceQuoteFollowupTokens(text, quote) {
  if (!text) return "";
  const address = [quote?.street, quote?.suburb].filter(Boolean).join(", ");
  const map = {
    "{ProjectName}": address,
    "{Address}": address,
    "{Street}": quote?.street || "",
    "{Suburb}": quote?.suburb || "",
    "{State}": quote?.state || "",
    "{ClientName}": quote?.name || "",
    "{Contact1}": quote?.email || "",
    "{Email}": quote?.email || "",
    "{Phone}": quote?.phone || "",
  };
  let out = String(text);
  Object.entries(map).forEach(([k, v]) => {
    out = out.split(k).join(v || "");
  });
  return out;
}

function quoteEmailButtonStyle() {
  const saved = buildSavedButtonStyle(QUOTE_EMAIL_BUTTON_ID, true);
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
    minWidth: "58px",
    height: "auto",
    padding: "4px 8px",
    fontSize: (saved && saved.fontSize) || "0.75rem",
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxSizing: "border-box",
    lineHeight: 1.2,
  };
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

function quoteEditButtonStyle() {
  const saved = buildSavedButtonStyle(QUOTE_EDIT_BUTTON_ID, true);
  const fallback = {
    background: SECTION_GREY,
    color: MONUMENT,
    border: `1px solid ${GRID_LINE}`,
    borderRadius: "6px",
    fontWeight: 600,
  };
  return {
    ...(saved || fallback),
    width: "auto",
    minWidth: "52px",
    height: "auto",
    padding: "4px 8px",
    fontSize: (saved && saved.fontSize) || "0.75rem",
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxSizing: "border-box",
    lineHeight: 1.2,
  };
}

function QuoteSheetRow({ value, disabled, onEmailClick, trailing }) {
  const stateValue = STATE_OPTIONS.includes(String(value.state || "").trim().toUpperCase())
    ? String(value.state).trim().toUpperCase()
    : "";
  return (
    <tr>
      {COLS.map((col) => {
        if (col.type === "emailBtn") {
          return (
            <td key={col.key} style={{ ...tdStyle, padding: "4px 6px", textAlign: "center" }}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onEmailClick?.()}
                style={{
                  ...quoteEmailButtonStyle(),
                  opacity: disabled ? 0.6 : 1,
                  cursor: disabled ? "default" : "pointer",
                }}
              >
                Email
              </button>
            </td>
          );
        }
        if (col.type === "date") {
          const stale = isQuoteDateOlderThanThreeDays(value.created_at);
          return (
            <td
              key={col.key}
              style={{
                ...tdStyle,
                ...cellTextStyle,
                color: stale ? "#cc3333" : MONUMENT,
                fontWeight: stale ? 700 : 400,
                minWidth: 96,
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
                minWidth: 72,
                fontWeight: stateValue ? 700 : 400,
                color: stateValue ? MONUMENT : UI.textMuted,
              }}
            >
              {stateValue || "—"}
            </td>
          );
        }
        if (col.type === "check" || col.type === "subcheck") {
          const checked =
            col.type === "check" ? Boolean(value.contacted) : Boolean(value[col.key]);
          return (
            <td key={col.key} style={checkCellStyle}>
              <input
                type="checkbox"
                checked={checked}
                disabled
                readOnly
                aria-label={col.label}
              />
            </td>
          );
        }
        return (
          <td key={col.key} style={{ ...tdStyle, ...cellTextStyle }} title={value[col.key] || ""}>
            {value[col.key] || ""}
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
  const { runWithEmailOverlay } = useEmailSendOverlay();
  const pasteRef = useRef(null);
  const emailBodyRef = useRef(null);
  const [quotes, setQuotes] = useState([]);
  const [edits, setEdits] = useState({});
  const [pasteBox, setPasteBox] = useState("");
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [addressForm, setAddressForm] = useState({ state: "", street: "", suburb: "" });
  const [rawPaste, setRawPaste] = useState("");
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [clientForm, setClientForm] = useState({ clientName: "", email: "", phone: "" });
  const [editingQuoteId, setEditingQuoteId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState(null);
  const [, setUiButtonStyleRevision] = useState(0);

  const [emailPreviewOpen, setEmailPreviewOpen] = useState(false);
  const [emailPreviewPreparing, setEmailPreviewPreparing] = useState(false);
  const [emailPreviewQuote, setEmailPreviewQuote] = useState(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailFrom, setEmailFrom] = useState(QUOTE_FOLLOWUP_FROM);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

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

  useEffect(() => {
    if (emailPreviewOpen && emailBodyRef.current && emailBody != null && !emailPreviewPreparing) {
      emailBodyRef.current.innerHTML = emailBody || "";
    }
  }, [emailPreviewOpen, emailBody, emailPreviewPreparing]);
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

  function cancelQuoteModalFlow() {
    setClientModalOpen(false);
    setClientForm({ clientName: "", email: "", phone: "" });
    setAddressModalOpen(false);
    setEditingQuoteId(null);
    setRawPaste("");
    setAddressForm({ state: "", street: "", suburb: "" });
    requestAnimationFrame(() => pasteRef.current?.focus());
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

  function closeEmailPreview() {
    setEmailPreviewOpen(false);
    setEmailPreviewPreparing(false);
    setEmailPreviewQuote(null);
    setEmailTo("");
    setEmailFrom(QUOTE_FOLLOWUP_FROM);
    setEmailSubject("");
    setEmailBody("");
  }

  async function openEmailPreview(quoteId) {
    const quote = edits[quoteId] || emptyQuote();
    const toAddress = String(quote.email || "").trim();
    if (!toAddress) {
      alert("Add a client email on this quote before sending.");
      return;
    }

    setEmailPreviewQuote({ id: quoteId, ...quote });
    setEmailPreviewOpen(true);
    setEmailPreviewPreparing(true);
    setEmailTo(toAddress);
    setEmailFrom(QUOTE_FOLLOWUP_FROM);
    setEmailSubject("");
    setEmailBody("");

    try {
      const templatesResponse = await fetch(`${API_URL}/api/email-templates`);
      if (!templatesResponse.ok) throw new Error("Failed to fetch email templates");
      const templates = await templatesResponse.json();
      const template = (Array.isArray(templates) ? templates : []).find(
        (t) => t.name && t.name.toLowerCase().trim() === QUOTE_FOLLOWUP_TEMPLATE.toLowerCase()
      );
      if (!template) {
        alert(
          `Template "${QUOTE_FOLLOWUP_TEMPLATE}" not found. Please create it in Settings → Email Templates.`
        );
        closeEmailPreview();
        return;
      }

      setEmailSubject(
        await replaceLoggedInUserEmailTokens(replaceQuoteFollowupTokens(template.subject || "", quote))
      );
      setEmailBody(
        convertEmailBodyNewlinesToBr(
          await replaceLoggedInUserEmailTokens(replaceQuoteFollowupTokens(template.body || "", quote))
        )
      );
    } catch (err) {
      console.error("Error preparing quote followup email:", err);
      alert(`Failed to prepare email: ${err.message || "Unknown error"}`);
      closeEmailPreview();
    } finally {
      setEmailPreviewPreparing(false);
    }
  }

  async function handleSendQuoteFollowupEmail() {
    const toAddresses = String(emailTo || "")
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
    if (toAddresses.length === 0) {
      alert("Please enter at least one email address.");
      return;
    }
    if (!String(emailFrom || "").trim()) {
      alert("From address is required.");
      return;
    }
    try {
      await runWithEmailOverlay(async () => {
        const res = await fetch(`${API_URL}/api/emails/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getApiHeaders() },
          body: JSON.stringify({
            to: toAddresses,
            from: String(emailFrom).trim(),
            subject: emailSubject || "",
            htmlBody: emailBody || "",
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Send failed (${res.status})`);
      });
      closeEmailPreview();
      alert("Quote followup email sent.");
    } catch (err) {
      console.error("Error sending quote followup email:", err);
      alert(err.message || "Failed to send email.");
    }
  }

  const busy = savingId === "new" || (editingQuoteId != null && savingId === editingQuoteId);

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
                  <col style={{ width: "210px" }} />
                </colgroup>
                <thead>
                  <tr>
                    {COLS.map((col) => (
                      <th key={col.key} style={thStyle}>
                        {col.label}
                      </th>
                    ))}
                    <th style={{ ...thStyle, textAlign: "center", width: 210 }}> </th>
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
                      const rowBusy = savingId === quote.id;
                      return (
                        <QuoteSheetRow
                          key={quote.id}
                          value={value}
                          disabled={busy || rowBusy}
                          onEmailClick={() => openEmailPreview(quote.id)}
                          trailing={
                            <div style={{ display: "flex", gap: "6px", alignItems: "center", justifyContent: "flex-end" }}>
                              <button
                                type="button"
                                disabled={busy || rowBusy}
                                onClick={() => openEditQuote(quote.id)}
                                style={{
                                  ...quoteEditButtonStyle(),
                                  opacity: busy || rowBusy ? 0.6 : 1,
                                  cursor: busy || rowBusy ? "default" : "pointer",
                                }}
                              >
                                Edit
                              </button>
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

      {addressModalOpen ? (
        <ModalBackdrop zIndex={1000} onClick={cancelQuoteModalFlow}>
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

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
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
        </ModalBackdrop>
      ) : null}

      <NewProject2
        isOpen={clientModalOpen}
        onClose={cancelQuoteModalFlow}
        formData={clientForm}
        onFormDataChange={setClientForm}
        onBack={handleClientModalBack}
        onNext={handleClientModalNext}
        nextLabel={
          savingId === "new" || (editingQuoteId != null && savingId === editingQuoteId)
            ? "Saving…"
            : editingQuoteId != null
              ? "Save"
              : "Save quote"
        }
      />

      {emailPreviewOpen ? (
        <ModalBackdrop zIndex={1000} onClick={closeEmailPreview}>
          <div
            role="dialog"
            aria-modal="true"
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "24px",
              width: "90%",
              maxWidth: "800px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <h2 style={{ margin: 0, fontSize: "1.5rem", color: MONUMENT }}>Preview & Send Email</h2>
              <button
                type="button"
                onClick={closeEmailPreview}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                  color: MONUMENT,
                  padding: 0,
                  width: 30,
                  height: 30,
                }}
              >
                ×
              </button>
            </div>

            {emailPreviewPreparing ? (
              <div style={{ textAlign: "center", padding: "40px", color: MONUMENT }}>Preparing email…</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ fontSize: "0.9rem", color: "#666" }}>
                  Template: <strong>{QUOTE_FOLLOWUP_TEMPLATE}</strong>
                  {emailPreviewQuote
                    ? ` | ${[emailPreviewQuote.street, emailPreviewQuote.suburb].filter(Boolean).join(", ")}`
                    : ""}
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.9rem",
                      color: UI.textMuted,
                      marginBottom: "6px",
                      fontWeight: 500,
                    }}
                  >
                    To
                  </label>
                  <input
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: `1px solid ${SECTION_GREY}`,
                      fontSize: "1rem",
                      boxSizing: "border-box",
                      color: MONUMENT,
                      background: WHITE,
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.9rem",
                      color: UI.textMuted,
                      marginBottom: "6px",
                      fontWeight: 500,
                    }}
                  >
                    From
                  </label>
                  <input
                    value={emailFrom}
                    onChange={(e) => setEmailFrom(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: `1px solid ${SECTION_GREY}`,
                      fontSize: "1rem",
                      boxSizing: "border-box",
                      color: MONUMENT,
                      background: WHITE,
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.9rem",
                      color: UI.textMuted,
                      marginBottom: "6px",
                      fontWeight: 500,
                    }}
                  >
                    Subject
                  </label>
                  <input
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: `1px solid ${SECTION_GREY}`,
                      fontSize: "1rem",
                      boxSizing: "border-box",
                      color: MONUMENT,
                      background: WHITE,
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.9rem",
                      color: UI.textMuted,
                      marginBottom: "6px",
                      fontWeight: 500,
                    }}
                  >
                    Email Preview
                  </label>
                  <div
                    ref={emailBodyRef}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={(e) => setEmailBody(e.currentTarget.innerHTML)}
                    style={{
                      width: "100%",
                      minHeight: "220px",
                      maxHeight: "42vh",
                      overflowY: "auto",
                      padding: "12px",
                      borderRadius: "8px",
                      border: `1px solid ${SECTION_GREY}`,
                      background: WHITE,
                      fontSize: "1rem",
                      color: MONUMENT,
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "4px" }}>
                  <button
                    type="button"
                    onClick={closeEmailPreview}
                    style={{
                      background: SECTION_GREY,
                      color: MONUMENT,
                      border: "none",
                      borderRadius: "8px",
                      padding: "10px 20px",
                      fontSize: "0.95rem",
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSendQuoteFollowupEmail}
                    style={{
                      background: MONUMENT,
                      color: WHITE,
                      border: "none",
                      borderRadius: "8px",
                      padding: "10px 20px",
                      fontSize: "0.95rem",
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Send
                  </button>
                </div>
              </div>
            )}
          </div>
        </ModalBackdrop>
      ) : null}
    </div>
  );
}
