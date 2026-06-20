import React, { useState, useEffect, useRef } from "react";

import { UI } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const LIGHT_MONUMENT = "#5c5c5e";
const API_URL = "";

/** Maps grid index 0–15 to settings keys smtp_user_1..smtp_pass_16 */
const SMTP_SLOT_KEYS = Array.from({ length: 16 }, (_, j) => {
  const n = j + 1;
  return { user: `smtp_user_${n}`, pass: `smtp_pass_${n}` };
});

const SMTP_CARD = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  backgroundColor: SECTION_GREY,
  padding: "12px 14px",
  borderRadius: "8px",
  border: "1px solid rgba(50, 50, 50, 0.35)",
  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.08)",
};

const LAB = {
  display: "block",
  fontSize: "0.75rem",
  color: UI.textMuted,
  marginBottom: "4px",
  fontWeight: 500,
};

const INPUT = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: "6px",
  border: "none",
  fontSize: "0.875rem",
  color: MONUMENT,
  background: WHITE,
  boxSizing: "border-box",
};

const BTN_SECONDARY = {
  background: SECTION_GREY,
  color: MONUMENT,
  border: "none",
  borderRadius: "8px",
  padding: "8px 14px",
  fontSize: "0.875rem",
  fontWeight: 500,
  cursor: "pointer",
  flexShrink: 0,
  whiteSpace: "nowrap",
};

const BTN_PRIMARY = {
  background: MONUMENT,
  color: PAGE_TEXT,
  border: "1px solid rgba(0,0,0,0.2)",
  borderRadius: "8px",
  padding: "8px 14px",
  fontSize: "0.875rem",
  fontWeight: 500,
  cursor: "pointer",
  flexShrink: 0,
  whiteSpace: "nowrap",
};

const BTN_ICON = {
  ...BTN_SECONDARY,
  padding: "0",
  minWidth: "36px",
  width: "36px",
  height: "36px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "6px",
  color: MONUMENT,
};

/** Open eye when password hidden (tap to show); slashed eye when visible (tap to hide). */
function PasswordVisibilityIcon({ revealed }) {
  const s = { width: 18, height: 18, display: "block", flexShrink: 0 };
  if (revealed) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={s}
        aria-hidden
      >
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={s}
      aria-hidden
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function slotsFromApi(data) {
  return SMTP_SLOT_KEYS.map(({ user, pass }) => ({
    user: (data[user] != null ? String(data[user]) : "") || "",
    pass: (data[pass] != null ? String(data[pass]) : "") || "",
  }));
}

export default function EmailSettings() {
  const [smtpSlots, setSmtpSlots] = useState(() =>
    Array.from({ length: 16 }, () => ({ user: "", pass: "" }))
  );
  const smtpSlotsRef = useRef(smtpSlots);
  const [loading, setLoading] = useState(true);
  const [passVisible, setPassVisible] = useState(() => ({}));
  const [testModalIndex, setTestModalIndex] = useState(null);
  const [testSending, setTestSending] = useState(false);
  const [testError, setTestError] = useState(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (testModalIndex == null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [testModalIndex]);

  async function fetchSettings() {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/settings`);
      if (!response.ok) {
        throw new Error("Failed to fetch settings");
      }
      const data = await response.json();
      const next = slotsFromApi(data);
      setSmtpSlots(next);
      smtpSlotsRef.current = next;
    } catch (error) {
      console.error("Error fetching settings:", error);
      const empty = Array.from({ length: 16 }, () => ({ user: "", pass: "" }));
      setSmtpSlots(empty);
      smtpSlotsRef.current = empty;
    } finally {
      setLoading(false);
    }
  }

  async function saveSmtpSettings() {
    try {
      const slots = smtpSlotsRef.current;
      const payload = {};
      slots.forEach((slot, i) => {
        const { user: userKey, pass: passKey } = SMTP_SLOT_KEYS[i];
        payload[userKey] = (slot.user || "").trim() || null;
        payload[passKey] = slot.pass != null && String(slot.pass).trim() !== "" ? String(slot.pass) : null;
      });
      const res = await fetch(`${API_URL}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to save SMTP settings");
      }
    } catch (e) {
      console.error("Save SMTP:", e);
      alert(e.message || "Failed to save SMTP settings");
    }
  }

  function updateSlot(index, field, value) {
    const prev = smtpSlotsRef.current;
    const next = prev.map((s, i) => (i === index ? { ...s, [field]: value } : s));
    smtpSlotsRef.current = next;
    setSmtpSlots(next);
  }

  function togglePassVisible(index) {
    setPassVisible((v) => ({ ...v, [index]: !v[index] }));
  }

  function closeTestModal() {
    setTestModalIndex(null);
    setTestError(null);
    setTestSending(false);
  }

  async function confirmSendTest() {
    if (testModalIndex == null) return;
    const slot = smtpSlotsRef.current[testModalIndex];
    const smtpUser = (slot?.user || "").trim();
    const smtpPass = slot?.pass != null ? String(slot.pass) : "";
    if (!smtpUser || !smtpPass) {
      setTestError("Enter SMTP User and Pass for this slot first.");
      return;
    }
    setTestError(null);
    setTestSending(true);
    try {
      const res = await fetch(`${API_URL}/api/emails/smtp-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smtpUser, smtpPass }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to send test email");
      }
      closeTestModal();
      alert(`Test email sent to ben@superiorgrannyflats.com.au from ${smtpUser}.`);
    } catch (e) {
      setTestError(e.message || "Failed to send test email");
    } finally {
      setTestSending(false);
    }
  }

  const modalSlot = testModalIndex != null ? smtpSlots[testModalIndex] : null;

  if (loading) {
    return (
      <div style={{ padding: "24px", textAlign: "center", color: MONUMENT }}>
        Loading...
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        padding: "24px 32px",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
      }}
    >
      <style>{`
        .email-settings-smtp-input::placeholder {
          color: #c4c4c6;
          opacity: 1;
        }
        .email-settings-smtp-input::-webkit-input-placeholder {
          color: #c4c4c6;
        }
      `}</style>
      <h2 style={{ fontSize: "1.5rem", marginTop: 0, marginBottom: "24px", color: MONUMENT }}>
        SMTP Settings
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "16px",
          width: "100%",
          maxWidth: "1400px",
        }}
      >
        {smtpSlots.map((slot, index) => (
          <div key={index} style={SMTP_CARD}>
            <div>
              <label style={LAB}>SMTP User</label>
              <input
                type="text"
                className="email-settings-smtp-input"
                value={slot.user}
                onChange={(e) => updateSlot(index, "user", e.target.value)}
                onBlur={saveSmtpSettings}
                placeholder="e.g. info@example.com"
                style={INPUT}
                autoComplete="off"
              />
            </div>
            <div>
              <label style={LAB}>SMTP Pass</label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  width: "100%",
                }}
              >
                <input
                  type={passVisible[index] ? "text" : "password"}
                  className="email-settings-smtp-input"
                  value={slot.pass}
                  onChange={(e) => updateSlot(index, "pass", e.target.value)}
                  onBlur={saveSmtpSettings}
                  placeholder="App password"
                  style={{
                    ...INPUT,
                    flex: "0 0 50%",
                    width: "50%",
                    maxWidth: "50%",
                    minWidth: 0,
                  }}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  title={passVisible[index] ? "Hide password" : "Show password"}
                  aria-label={passVisible[index] ? "Hide password" : "Show password"}
                  onClick={() => togglePassVisible(index)}
                  style={BTN_ICON}
                >
                  <PasswordVisibilityIcon revealed={!!passVisible[index]} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTestError(null);
                    setTestModalIndex(index);
                  }}
                  style={BTN_PRIMARY}
                >
                  Send Test
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {testModalIndex != null && modalSlot && (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="smtp-test-title"
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "28px 32px",
              maxWidth: "440px",
              width: "100%",
              boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="smtp-test-title"
              style={{ margin: "0 0 12px 0", fontSize: "1.35rem", color: MONUMENT, fontWeight: 600 }}
            >
              Send test email
            </h2>
            <p style={{ margin: "0 0 8px 0", fontSize: "1rem", color: LIGHT_MONUMENT, lineHeight: 1.5 }}>
              Send one message to <strong>ben@superiorgrannyflats.com.au</strong> using this slot&apos;s SMTP
              User as the From address and the password you entered (including unsaved changes).
            </p>
            <p style={{ margin: "0 0 20px 0", fontSize: "0.9rem", color: MONUMENT, lineHeight: 1.5 }}>
              From: <strong>{(modalSlot.user || "").trim() || "(empty)"}</strong>
            </p>
            {testError && (
              <p
                style={{
                  margin: "0 0 16px 0",
                  fontSize: "0.9rem",
                  color: "#b00020",
                  lineHeight: 1.45,
                }}
              >
                {testError}
              </p>
            )}
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button type="button" onClick={closeTestModal} disabled={testSending} style={BTN_SECONDARY}>
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSendTest}
                disabled={testSending}
                style={{
                  ...BTN_PRIMARY,
                  opacity: testSending ? 0.7 : 1,
                  cursor: testSending ? "wait" : "pointer",
                }}
              >
                {testSending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
