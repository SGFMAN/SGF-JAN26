import React, { useEffect, useRef, useState } from "react";

import {
  emailGeneralJsonForPersist,
  parseEmailGeneralJson,
} from "../utils/emailGeneralSettings";
import { UI } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const API_URL = "";

function smtpSlotEmailsFromSettings(data) {
  if (!data || typeof data !== "object") return [];
  const seen = new Set();
  const list = [];
  for (let i = 1; i <= 16; i++) {
    const raw = data[`smtp_user_${i}`];
    const e = raw == null ? "" : String(raw).trim();
    if (!e) continue;
    const key = e.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(e);
  }
  list.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return list;
}

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

const selectStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: "8px",
  border: "none",
  fontSize: "1rem",
  color: MONUMENT,
  background: WHITE,
  boxSizing: "border-box",
};

export default function SiteVisitSettings() {
  const [toEmail, setToEmail] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [smtpEmails, setSmtpEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const toEmailRef = useRef(toEmail);
  const fromEmailRef = useRef(fromEmail);

  useEffect(() => {
    toEmailRef.current = toEmail;
  }, [toEmail]);

  useEffect(() => {
    fromEmailRef.current = fromEmail;
  }, [fromEmail]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_URL}/api/settings`);
        if (!res.ok) throw new Error("Failed to fetch settings");
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        const sv = parseEmailGeneralJson(data.email_general_json).siteVisits || {};
        const nextTo = String(sv.toEmail || "").trim();
        const nextFrom = String(sv.fromEmail || "").trim();
        toEmailRef.current = nextTo;
        fromEmailRef.current = nextFrom;
        setToEmail(nextTo);
        setFromEmail(nextFrom);
        setSmtpEmails(smtpSlotEmailsFromSettings(data));
      } catch (err) {
        console.error("Error loading site visit settings:", err);
        if (!cancelled) {
          toEmailRef.current = "";
          fromEmailRef.current = "";
          setToEmail("");
          setFromEmail("");
          setSmtpEmails([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveSettings(nextTo, nextFrom) {
    try {
      const settingsRes = await fetch(`${API_URL}/api/settings`);
      if (!settingsRes.ok) throw new Error("Failed to load settings");
      const data = await settingsRes.json().catch(() => ({}));
      const eg = parseEmailGeneralJson(data.email_general_json);
      const nextJson = {
        ...eg,
        siteVisits: {
          toEmail: String(nextTo || "").trim(),
          fromEmail: String(nextFrom || "").trim(),
        },
      };
      const response = await fetch(`${API_URL}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_general_json: emailGeneralJsonForPersist(nextJson) }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        alert(`Failed to save site visit settings: ${errorData.error || response.statusText}`);
      }
    } catch (error) {
      console.error("Error saving site visit settings:", error);
      alert(`Error saving site visit settings: ${error.message}`);
    }
  }

  function updateToEmail(email) {
    const nextTo = String(email || "").trim();
    toEmailRef.current = nextTo;
    setToEmail(nextTo);
    void saveSettings(nextTo, fromEmailRef.current);
  }

  function updateFromEmail(email) {
    const nextFrom = String(email || "").trim();
    fromEmailRef.current = nextFrom;
    setFromEmail(nextFrom);
    void saveSettings(toEmailRef.current, nextFrom);
  }

  function renderSmtpSelect(id, label, value, onChange) {
    return (
      <div style={cardStyle}>
        <h3 style={{ fontSize: "1rem", margin: 0, color: MONUMENT, fontWeight: 600 }}>{label}</h3>
        <select id={id} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
          <option value="">Select an address…</option>
          {value && !smtpEmails.some((email) => email.toLowerCase() === value.toLowerCase()) ? (
            <option value={value}>{value}</option>
          ) : null}
          {smtpEmails.map((email) => (
            <option key={email} value={email}>
              {email}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (loading) {
    return <div style={{ color: MONUMENT, padding: "16px 24px" }}>Loading...</div>;
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        padding: "16px 24px",
        boxSizing: "border-box",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: "20px",
      }}
    >
      <div>
        <h2
          style={{
            margin: 0,
            fontSize: "1.5rem",
            fontWeight: 700,
            color: MONUMENT,
          }}
        >
          Site Visits
        </h2>
        <p style={{ margin: "8px 0 0 0", fontSize: "0.9rem", color: UI.textMuted, lineHeight: 1.4 }}>
          After client site visit emails are sent, a confirmation list is emailed using these
          addresses. Changes save automatically.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 320px))",
          gap: "16px",
          width: "100%",
          alignItems: "start",
        }}
      >
        {renderSmtpSelect("site-visit-to-email", "To", toEmail, updateToEmail)}
        {renderSmtpSelect("site-visit-from-email", "From", fromEmail, updateFromEmail)}
      </div>
      {smtpEmails.length === 0 ? (
        <p style={{ margin: 0, fontSize: "0.85rem", color: UI.textMuted, lineHeight: 1.4 }}>
          Add SMTP addresses in Settings → SMTP Settings first.
        </p>
      ) : null}
    </div>
  );
}
