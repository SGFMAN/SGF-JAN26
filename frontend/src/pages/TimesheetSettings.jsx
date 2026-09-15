import React, { useEffect, useMemo, useRef, useState } from "react";
import { useEmailSendOverlay } from "../components/EmailSendOverlay";
import { getApiHeaders } from "../utils/auth";
import {
  BASE_HOURLY_OPTIONS,
  DEFAULT_BASE_HOURLY_HOURS,
  DEFAULT_OVERTIME_15_HOURS,
  OVERTIME_15_OPTIONS,
  PAY_RATE,
  buildCollatedTimesheetTxt,
  clampPayHours,
  formatHourOptionLabel,
  submittedTimesheetUsers,
  timesheetTickedUsers,
  submittedTimesheetUserIds,
} from "../utils/timeSheetCollate";
import {
  formatPeriodRange,
  getPayCycleWednesdayForDate,
  getPayPeriodBounds,
  getPayPeriodDays,
} from "../utils/timeSheetPayCycle";
import { UI, INDICATOR, outlineBorder } from "../utils/uiThemeTokens.js";

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

const USERS_PER_LEFT_COLUMN = 20;

function TimesheetUserRows({ users, submittedUserIds }) {
  return users.map((user) => {
    const sent = submittedUserIds.has(Number(user.id));
    return (
      <div
        key={user.id}
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "10px",
          padding: "3px 0",
          lineHeight: 1.3,
        }}
      >
        <span style={{ fontSize: "0.9rem", color: sent ? INDICATOR.green : MONUMENT, fontWeight: sent ? 700 : 500 }}>
          {user.name || "User"}
        </span>
        <span
          style={{
            fontSize: "0.85rem",
            fontWeight: 600,
            color: sent ? INDICATOR.green : UI.textMuted,
            whiteSpace: "nowrap",
          }}
        >
          {sent ? "Sent" : "Not sent"}
        </span>
      </div>
    );
  });
}

const userColumnHeadingStyle = {
  fontSize: "1rem",
  margin: 0,
  color: MONUMENT,
  fontWeight: 600,
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

export default function TimesheetSettings() {
  const { runWithEmailOverlay } = useEmailSendOverlay();
  const [users, setUsers] = useState([]);
  const [fromEmail, setFromEmail] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [baseHourlyHours, setBaseHourlyHours] = useState(DEFAULT_BASE_HOURLY_HOURS);
  const [overtime15Hours, setOvertime15Hours] = useState(DEFAULT_OVERTIME_15_HOURS);
  const [smtpEmails, setSmtpEmails] = useState([]);
  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const fromEmailRef = useRef(fromEmail);
  const toEmailRef = useRef(toEmail);
  const baseHourlyHoursRef = useRef(baseHourlyHours);
  const overtime15HoursRef = useRef(overtime15Hours);

  const cycleWednesday = useMemo(() => getPayCycleWednesdayForDate(), []);
  const periodDays = useMemo(() => getPayPeriodDays(cycleWednesday), [cycleWednesday]);
  const cycleKey = cycleWednesday.toISOString().slice(0, 10);
  const periodLabel = useMemo(() => {
    const { periodStart, periodEnd } = getPayPeriodBounds(cycleWednesday);
    return formatPeriodRange(periodStart, periodEnd);
  }, [cycleWednesday]);

  const timesheetUsers = useMemo(() => timesheetTickedUsers(users), [users]);

  const submittedUserIds = useMemo(() => submittedTimesheetUserIds(sheets), [sheets]);

  const userListColumns = useMemo(() => {
    return [
      timesheetUsers.slice(0, USERS_PER_LEFT_COLUMN),
      timesheetUsers.slice(USERS_PER_LEFT_COLUMN),
    ];
  }, [timesheetUsers]);

  useEffect(() => {
    fromEmailRef.current = fromEmail;
  }, [fromEmail]);

  useEffect(() => {
    toEmailRef.current = toEmail;
  }, [toEmail]);

  useEffect(() => {
    baseHourlyHoursRef.current = baseHourlyHours;
  }, [baseHourlyHours]);

  useEffect(() => {
    overtime15HoursRef.current = overtime15Hours;
  }, [overtime15Hours]);

  async function loadSheets(cancelled = { current: false }) {
    try {
      const sheetsRes = await fetch(
        `${API_URL}/api/timesheets?cycleKey=${encodeURIComponent(cycleKey)}`,
        { headers: getApiHeaders() }
      );
      const sheetsData = await sheetsRes.json().catch(() => ({}));
      if (cancelled.current) return;
      if (!sheetsRes.ok) {
        setSheets([]);
        return;
      }
      setSheets(Array.isArray(sheetsData.sheets) ? sheetsData.sheets : []);
    } catch (error) {
      console.error("Error loading time sheets:", error);
      if (!cancelled.current) setSheets([]);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [usersRes, settingsRes, smtpRes, sheetsRes] = await Promise.all([
          fetch(`${API_URL}/api/users`),
          fetch(`${API_URL}/api/timesheet-settings`),
          fetch(`${API_URL}/api/settings`),
          fetch(`${API_URL}/api/timesheets?cycleKey=${encodeURIComponent(cycleKey)}`, {
            headers: getApiHeaders(),
          }),
        ]);
        if (cancelled) return;

        const userList = usersRes.ok ? await usersRes.json().catch(() => []) : [];
        setUsers(Array.isArray(userList) ? userList : []);

        let nextFrom = "";
        let nextTo = "";
        let nextBase = DEFAULT_BASE_HOURLY_HOURS;
        let nextOt15 = DEFAULT_OVERTIME_15_HOURS;
        if (settingsRes.ok) {
          const data = await settingsRes.json().catch(() => ({}));
          const saved = data?.settings || {};
          nextFrom = String(saved.fromEmail || "").trim();
          nextTo = String(saved.toEmail || "").trim();
          nextBase = clampPayHours(
            saved.baseHourlyHours,
            BASE_HOURLY_OPTIONS[0],
            BASE_HOURLY_OPTIONS[BASE_HOURLY_OPTIONS.length - 1],
            DEFAULT_BASE_HOURLY_HOURS
          );
          nextOt15 = clampPayHours(
            saved.overtime15Hours,
            OVERTIME_15_OPTIONS[0],
            OVERTIME_15_OPTIONS[OVERTIME_15_OPTIONS.length - 1],
            DEFAULT_OVERTIME_15_HOURS
          );
        }
        setFromEmail(nextFrom);
        fromEmailRef.current = nextFrom;
        setToEmail(nextTo);
        toEmailRef.current = nextTo;
        setBaseHourlyHours(nextBase);
        baseHourlyHoursRef.current = nextBase;
        setOvertime15Hours(nextOt15);
        overtime15HoursRef.current = nextOt15;

        if (smtpRes.ok) {
          const settings = await smtpRes.json().catch(() => ({}));
          setSmtpEmails(smtpSlotEmailsFromSettings(settings));
        } else {
          setSmtpEmails([]);
        }

        if (sheetsRes.ok) {
          const sheetsData = await sheetsRes.json().catch(() => ({}));
          setSheets(Array.isArray(sheetsData.sheets) ? sheetsData.sheets : []);
        } else {
          setSheets([]);
        }
      } catch (err) {
        console.error("Error loading timesheet settings:", err);
        if (!cancelled) {
          setUsers([]);
          setFromEmail("");
          setToEmail("");
          setBaseHourlyHours(DEFAULT_BASE_HOURLY_HOURS);
          setOvertime15Hours(DEFAULT_OVERTIME_15_HOURS);
          setSmtpEmails([]);
          setSheets([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cycleKey]);

  async function saveSettings(nextFrom, nextTo, nextBase, nextOt15) {
    try {
      const response = await fetch(`${API_URL}/api/timesheet-settings`, {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify({
          settings: {
            fromEmail: nextFrom,
            toEmail: nextTo,
            baseHourlyHours: nextBase,
            overtime15Hours: nextOt15,
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

  function persistSettings(nextFrom, nextTo, nextBase, nextOt15) {
    void saveSettings(
      nextFrom ?? fromEmailRef.current,
      nextTo ?? toEmailRef.current,
      nextBase ?? baseHourlyHoursRef.current,
      nextOt15 ?? overtime15HoursRef.current
    );
  }

  function updateFromEmail(email) {
    const nextFrom = String(email || "").trim();
    fromEmailRef.current = nextFrom;
    setFromEmail(nextFrom);
    persistSettings(nextFrom, toEmailRef.current, baseHourlyHoursRef.current, overtime15HoursRef.current);
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
    persistSettings(fromEmailRef.current, nextTo, baseHourlyHoursRef.current, overtime15HoursRef.current);
  }

  function updateBaseHourlyHours(hours) {
    const next = clampPayHours(
      hours,
      BASE_HOURLY_OPTIONS[0],
      BASE_HOURLY_OPTIONS[BASE_HOURLY_OPTIONS.length - 1],
      DEFAULT_BASE_HOURLY_HOURS
    );
    baseHourlyHoursRef.current = next;
    setBaseHourlyHours(next);
    persistSettings(fromEmailRef.current, toEmailRef.current, next, overtime15HoursRef.current);
  }

  function updateOvertime15Hours(hours) {
    const next = clampPayHours(
      hours,
      OVERTIME_15_OPTIONS[0],
      OVERTIME_15_OPTIONS[OVERTIME_15_OPTIONS.length - 1],
      DEFAULT_OVERTIME_15_HOURS
    );
    overtime15HoursRef.current = next;
    setOvertime15Hours(next);
    persistSettings(fromEmailRef.current, toEmailRef.current, baseHourlyHoursRef.current, next);
  }

  async function handleExport() {
    if (exporting) return;
    const included = submittedTimesheetUsers(users, sheets);
    if (included.length === 0) {
      alert("No one has sent a time sheet for this pay cycle yet.");
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
        const sheetsRes = await fetch(`${API_URL}/api/timesheets?cycleKey=${encodeURIComponent(cycleKey)}`, {
          headers: getApiHeaders(),
        });
        const sheetsData = await sheetsRes.json().catch(() => ({}));
        if (!sheetsRes.ok) {
          throw new Error(sheetsData.error || `Failed to load time sheets (${sheetsRes.status})`);
        }

        const cycleSheets = Array.isArray(sheetsData.sheets) ? sheetsData.sheets : [];
        const sentUsers = submittedTimesheetUsers(users, cycleSheets);
        if (sentUsers.length === 0) {
          throw new Error("No one has sent a time sheet for this pay cycle yet.");
        }

        const txt = buildCollatedTimesheetTxt({
          users,
          sheets: cycleSheets,
          periodDays,
          rates: {
            baseHourlyHours,
            overtime15Hours,
          },
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

        const resetRes = await fetch(`${API_URL}/api/timesheets/reset-submissions`, {
          method: "POST",
          headers: getApiHeaders(),
          body: JSON.stringify({ cycleKey }),
        });
        const resetData = await resetRes.json().catch(() => ({}));
        if (!resetRes.ok) {
          throw new Error(resetData.error || `Exported, but failed to reset sent status (${resetRes.status})`);
        }
      });
      await loadSheets();
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
            Export the current pay cycle ({periodLabel}) for users who have clicked Send this cycle.
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
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "16px",
          width: "100%",
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 }}>
          <div style={cardStyle}>
            <h3 style={{ fontSize: "1rem", margin: 0, color: MONUMENT, fontWeight: 600 }}>{PAY_RATE.BASE}</h3>
            <label style={labelStyle} htmlFor="timesheet-base-hourly">
              Weekday hours
            </label>
            <select
              id="timesheet-base-hourly"
              aria-label="Base Hourly"
              value={baseHourlyHours}
              onChange={(e) => updateBaseHourlyHours(e.target.value)}
              style={selectStyle}
            >
              {BASE_HOURLY_OPTIONS.map((hours) => (
                <option key={hours} value={hours}>
                  {formatHourOptionLabel(hours)}
                </option>
              ))}
            </select>
          </div>

          <div style={cardStyle}>
            <h3 style={{ fontSize: "1rem", margin: 0, color: MONUMENT, fontWeight: 600 }}>{PAY_RATE.OT15}</h3>
            <label style={labelStyle} htmlFor="timesheet-overtime-15">
              Next hours
            </label>
            <select
              id="timesheet-overtime-15"
              aria-label="Overtime 1.5x"
              value={overtime15Hours}
              onChange={(e) => updateOvertime15Hours(e.target.value)}
              style={selectStyle}
            >
              {OVERTIME_15_OPTIONS.map((hours) => (
                <option key={hours} value={hours}>
                  {formatHourOptionLabel(hours)}
                </option>
              ))}
            </select>
          </div>

          <div style={cardStyle}>
            <h3 style={{ fontSize: "1rem", margin: 0, color: MONUMENT, fontWeight: 600 }}>{PAY_RATE.OT2}</h3>
            <div style={labelStyle}>Hours</div>
            <div
              style={{
                ...selectStyle,
                display: "flex",
                alignItems: "center",
                minHeight: "38px",
              }}
            >
              All Remaining
            </div>
          </div>
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
            <input
              id="timesheet-to-email"
              aria-label="To"
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

        <div style={{ ...cardStyle, gap: "8px" }}>
          <h3 style={userColumnHeadingStyle}>Users</h3>
          {timesheetUsers.length === 0 ? (
            <p style={{ margin: 0, fontSize: "0.85rem", color: UI.textMuted, lineHeight: 1.3 }}>
              No users have Timesheet ticked.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <TimesheetUserRows users={userListColumns[0]} submittedUserIds={submittedUserIds} />
            </div>
          )}
        </div>

        <div style={{ ...cardStyle, gap: "8px" }}>
          <h3 style={{ ...userColumnHeadingStyle, visibility: "hidden" }} aria-hidden="true">
            Users
          </h3>
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <TimesheetUserRows users={userListColumns[1]} submittedUserIds={submittedUserIds} />
          </div>
        </div>
      </div>
    </div>
  );
}
