import React, { useEffect, useMemo, useRef, useState } from "react";
import { useEmailSendOverlay } from "../components/EmailSendOverlay";
import { getApiHeaders } from "../utils/auth";
import { buildCollatedTimesheetTxt } from "../utils/timeSheetCollate";
import {
  formatPeriodRange,
  getPayCycleWednesdayForDate,
  getPayPeriodBounds,
  getPayPeriodDays,
} from "../utils/timeSheetPayCycle";
import { UI, outlineBorder } from "../utils/uiThemeTokens.js";

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

const labelStyle = {
  display: "block",
  fontSize: "0.9rem",
  color: UI.textMuted,
  marginBottom: "6px",
  fontWeight: 500,
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

const inputStyle = {
  ...selectStyle,
  border: outlineBorder,
};

const exportButtonStyle = {
  alignSelf: "flex-start",
  height: "36px",
  padding: "0 16px",
  fontSize: "0.95rem",
  fontWeight: 600,
  color: MONUMENT,
  background: WHITE,
  border: outlineBorder,
  borderRadius: "8px",
  cursor: "pointer",
};

function smtpSlotEmailsFromSettings(data) {
  if (!data || typeof data !== "object") return [];
  const seen = new Set();
  const list = [];
  for (let i = 1; i <= 16; i += 1) {
    const raw = data[`smtp_user_${i}`];
    const email = raw == null ? "" : String(raw).trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(email);
  }
  list.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return list;
}

function normalizeUserIds(users) {
  return (Array.isArray(users) ? users : [])
    .map((user) => Number(user.id))
    .filter((id) => Number.isFinite(id) && id > 0);
}

export default function TimesheetSettings() {
  const { runWithEmailOverlay } = useEmailSendOverlay();
  const [users, setUsers] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState(null);
  const [fromEmail, setFromEmail] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [smtpEmails, setSmtpEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const selectedUserIdsRef = useRef(selectedUserIds);
  const fromEmailRef = useRef(fromEmail);
  const toEmailRef = useRef(toEmail);

  const cycleWednesday = useMemo(() => getPayCycleWednesdayForDate(), []);
  const periodDays = useMemo(() => getPayPeriodDays(cycleWednesday), [cycleWednesday]);
  const cycleKey = cycleWednesday.toISOString().slice(0, 10);
  const periodLabel = useMemo(() => {
    const { periodStart, periodEnd } = getPayPeriodBounds(cycleWednesday);
    return formatPeriodRange(periodStart, periodEnd);
  }, [cycleWednesday]);

  useEffect(() => {
    selectedUserIdsRef.current = selectedUserIds;
  }, [selectedUserIds]);

  useEffect(() => {
    fromEmailRef.current = fromEmail;
  }, [fromEmail]);

  useEffect(() => {
    toEmailRef.current = toEmail;
  }, [toEmail]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [usersRes, settingsRes, smtpRes] = await Promise.all([
          fetch(`${API_URL}/api/users`),
          fetch(`${API_URL}/api/timesheet-settings`),
          fetch(`${API_URL}/api/settings`),
        ]);
        if (cancelled) return;

        const userList = usersRes.ok ? await usersRes.json().catch(() => []) : [];
        const list = Array.isArray(userList) ? userList : [];
        setUsers(list);

        let nextSelected = null;
        let nextFrom = "";
        let nextTo = "";
        if (settingsRes.ok) {
          const data = await settingsRes.json().catch(() => ({}));
          const saved = data?.settings || {};
          nextSelected = Array.isArray(saved.selectedUserIds) ? saved.selectedUserIds.map(Number) : null;
          nextFrom = String(saved.fromEmail || "").trim();
          nextTo = String(saved.toEmail || "").trim();
        }
        if (nextSelected == null) nextSelected = normalizeUserIds(list);
        setSelectedUserIds(nextSelected);
        selectedUserIdsRef.current = nextSelected;
        setFromEmail(nextFrom);
        fromEmailRef.current = nextFrom;
        setToEmail(nextTo);
        toEmailRef.current = nextTo;

        if (smtpRes.ok) {
          const settings = await smtpRes.json().catch(() => ({}));
          setSmtpEmails(smtpSlotEmailsFromSettings(settings));
        } else {
          setSmtpEmails([]);
        }
      } catch (err) {
        console.error("Error loading timesheet settings:", err);
        if (!cancelled) {
          setUsers([]);
          setSelectedUserIds([]);
          setFromEmail("");
          setToEmail("");
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

  async function saveSettings(nextSelected, nextFrom, nextTo) {
    try {
      const response = await fetch(`${API_URL}/api/timesheet-settings`, {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify({
          settings: {
            selectedUserIds: nextSelected,
            fromEmail: nextFrom,
            toEmail: nextTo,
          },
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        alert(`Failed to save timesheet settings: ${errorData.error || response.statusText}`);
      }
    } catch (error) {
      console.error("Error saving timesheet settings:", error);
      alert(`Error saving timesheet settings: ${error.message}`);
    }
  }

  function toggleUser(userId) {
    const id = Number(userId);
    setSelectedUserIds((prev) => {
      const current = Array.isArray(prev) ? prev : [];
      const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
      selectedUserIdsRef.current = next;
      void saveSettings(next, fromEmailRef.current, toEmailRef.current);
      return next;
    });
  }

  function updateFromEmail(email) {
    const nextFrom = String(email || "").trim();
    fromEmailRef.current = nextFrom;
    setFromEmail(nextFrom);
    void saveSettings(selectedUserIdsRef.current, nextFrom, toEmailRef.current);
  }

  function handleToEmailChange(e) {
    const nextTo = e.target.value;
    toEmailRef.current = nextTo;
    setToEmail(nextTo);
  }

  function handleToEmailBlur() {
    const nextTo = String(toEmailRef.current || "").trim();
    toEmailRef.current = nextTo;
    setToEmail(nextTo);
    void saveSettings(selectedUserIdsRef.current, fromEmailRef.current, nextTo);
  }

  async function handleExport() {
    if (exporting) return;
    const ids = Array.isArray(selectedUserIds) ? selectedUserIds : [];
    if (ids.length === 0) {
      alert("Select at least one user to include in the export.");
      return;
    }
    const from = String(fromEmail || "").trim();
    const to = String(toEmail || "").trim();
    if (!from) {
      alert("Select a From address.");
      return;
    }
    if (!to) {
      alert("Enter a To address.");
      return;
    }

    try {
      setExporting(true);
      await runWithEmailOverlay(async () => {
        const sheetsRes = await fetch(`${API_URL}/api/timesheets?cycleKey=${encodeURIComponent(cycleKey)}`);
        const sheetsData = await sheetsRes.json().catch(() => ({}));
        if (!sheetsRes.ok) {
          throw new Error(sheetsData.error || `Failed to load time sheets (${sheetsRes.status})`);
        }

        const txt = buildCollatedTimesheetTxt({
          users,
          selectedUserIds: ids,
          sheets: Array.isArray(sheetsData.sheets) ? sheetsData.sheets : [],
          periodDays,
        });
        const filename = `Timesheet_${cycleKey}.txt`;
        const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });

        const form = new FormData();
        form.append("to", to);
        form.append("from", from);
        form.append("subject", `Time sheets — ${periodLabel}`);
        form.append(
          "htmlBody",
          `Please find attached the time sheet export for ${periodLabel}.\n\nThis is an automated time sheet export.`
        );
        form.append("attachment", blob, filename);

        const res = await fetch(`${API_URL}/api/emails/send`, {
          method: "POST",
          body: form,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Send failed (${res.status})`);
      });
      alert("Time sheet export emailed.");
    } catch (error) {
      console.error("Time sheet export email:", error);
      alert(error.message || "Failed to email time sheet export.");
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return <div style={{ color: MONUMENT, padding: "16px 24px" }}>Loading...</div>;
  }

  const selectedSet = new Set((Array.isArray(selectedUserIds) ? selectedUserIds : []).map(Number));

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
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "16px",
          flexWrap: "wrap",
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
            Timesheet
          </h2>
          <p style={{ margin: "8px 0 0 0", fontSize: "0.9rem", color: UI.textMuted, lineHeight: 1.4 }}>
            Export the current pay cycle ({periodLabel}) for ticked users and email it as a text file.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          style={{
            ...exportButtonStyle,
            opacity: exporting ? 0.65 : 1,
            cursor: exporting ? "not-allowed" : "pointer",
          }}
        >
          {exporting ? "Exporting..." : "Export"}
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 0.8fr)",
          gap: "16px",
          width: "100%",
          alignItems: "start",
        }}
      >
        <div style={cardStyle}>
          <h3 style={{ fontSize: "1rem", margin: 0, color: MONUMENT, fontWeight: 600 }}>Users</h3>
          <p style={{ margin: 0, fontSize: "0.85rem", color: UI.textMuted, lineHeight: 1.4 }}>
            Only ticked users are included in the export.
          </p>
          {users.length === 0 ? (
            <p style={{ margin: 0, color: UI.textMuted }}>No users found.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {users.map((user) => (
                <label key={user.id} htmlFor={`timesheet-user-${user.id}`} style={checkboxRowStyle}>
                  <input
                    id={`timesheet-user-${user.id}`}
                    type="checkbox"
                    checked={selectedSet.has(Number(user.id))}
                    onChange={() => toggleUser(user.id)}
                    style={{ width: "18px", height: "18px", cursor: "pointer", flexShrink: 0 }}
                  />
                  <span style={{ fontSize: "0.9rem", color: MONUMENT }}>{user.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 }}>
          <div style={cardStyle}>
            <h3 style={{ fontSize: "1rem", margin: 0, color: MONUMENT, fontWeight: 600 }}>From</h3>
            <select
              id="timesheet-from-email"
              aria-label="From"
              value={fromEmail}
              onChange={(e) => updateFromEmail(e.target.value)}
              style={selectStyle}
            >
              <option value="">Select a From address…</option>
              {fromEmail && !smtpEmails.some((email) => email.toLowerCase() === fromEmail.toLowerCase()) ? (
                <option value={fromEmail}>{fromEmail}</option>
              ) : null}
              {smtpEmails.map((email) => (
                <option key={email} value={email}>
                  {email}
                </option>
              ))}
            </select>
          </div>

          <div style={cardStyle}>
            <h3 style={{ fontSize: "1rem", margin: 0, color: MONUMENT, fontWeight: 600 }}>To</h3>
            <label style={labelStyle} htmlFor="timesheet-to-email">
              Email address
            </label>
            <input
              id="timesheet-to-email"
              type="text"
              value={toEmail}
              onChange={handleToEmailChange}
              onBlur={handleToEmailBlur}
              placeholder="name@example.com"
              style={inputStyle}
              autoComplete="off"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
