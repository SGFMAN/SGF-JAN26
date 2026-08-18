import React, { useEffect, useRef, useState } from "react";

import { UI } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const API_URL = "";

const REMINDER_COUNT = 3;
const DELAY_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);

function emptyReminder(index) {
  return {
    enabled: false,
    delay: index + 1,
    templateName: "",
  };
}

function emptyReminders() {
  return Array.from({ length: REMINDER_COUNT }, (_, i) => emptyReminder(i));
}

function normalizeReminders(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return emptyReminders().map((fallback, i) => {
    const src = list[i] && typeof list[i] === "object" ? list[i] : {};
    const delayN = Number(src.delay);
    return {
      enabled: Boolean(src.enabled),
      delay: Number.isFinite(delayN) ? Math.min(10, Math.max(1, Math.round(delayN))) : fallback.delay,
      templateName: src.templateName != null ? String(src.templateName) : "",
    };
  });
}

function delayLabel(n) {
  return n === 1 ? "1 hour" : `${n} hours`;
}

export default function RemindersSettings() {
  const [reminders, setReminders] = useState(() => emptyReminders());
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const valuesRef = useRef(reminders);

  useEffect(() => {
    valuesRef.current = reminders;
  }, [reminders]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [settingsRes, templatesRes] = await Promise.all([
          fetch(`${API_URL}/api/reminder-settings`),
          fetch(`${API_URL}/api/email-templates`),
        ]);
        if (cancelled) return;
        if (settingsRes.ok) {
          const data = await settingsRes.json().catch(() => ({}));
          setReminders(normalizeReminders(data?.settings?.quotes?.reminders));
        } else {
          setReminders(emptyReminders());
        }
        if (templatesRes.ok) {
          const list = await templatesRes.json().catch(() => []);
          setTemplates(Array.isArray(list) ? list : []);
        } else {
          setTemplates([]);
        }
      } catch (err) {
        console.error("Error loading reminder settings:", err);
        if (!cancelled) {
          setReminders(emptyReminders());
          setTemplates([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveReminders(nextReminders) {
    try {
      const response = await fetch(`${API_URL}/api/reminder-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            quotes: { reminders: nextReminders },
          },
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        alert(`Failed to save reminders: ${errorData.error || response.statusText}`);
      }
    } catch (error) {
      console.error("Error saving reminder settings:", error);
      alert(`Error saving reminders: ${error.message}`);
    }
  }

  function updateReminder(index, patch) {
    setReminders((prev) => {
      const next = prev.map((row, i) => (i === index ? { ...row, ...patch } : row));
      valuesRef.current = next;
      void saveReminders(next);
      return next;
    });
  }

  const cardStyle = {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    backgroundColor: "#E5E5E7",
    padding: "14px 16px",
    borderRadius: "8px",
    width: "100%",
    maxWidth: "480px",
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
        alignItems: "flex-start",
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
          Quotes
        </h2>
      </div>

      {reminders.map((row, index) => (
        <div key={index} style={cardStyle}>
          <h3 style={{ fontSize: "1rem", margin: 0, color: MONUMENT, fontWeight: 600 }}>
            Reminder {index + 1}
          </h3>

          <label
            htmlFor={`quote-reminder-enabled-${index}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px 12px",
              borderRadius: "8px",
              background: WHITE,
              cursor: "pointer",
            }}
          >
            <input
              id={`quote-reminder-enabled-${index}`}
              type="checkbox"
              checked={row.enabled}
              onChange={(e) => updateReminder(index, { enabled: e.target.checked })}
              style={{ width: "18px", height: "18px", cursor: "pointer", flexShrink: 0 }}
            />
            <span style={{ fontSize: "0.9rem", color: MONUMENT }}>Enable reminder</span>
          </label>

          <div>
            <label style={labelStyle} htmlFor={`quote-reminder-delay-${index}`}>
              After
            </label>
            <select
              id={`quote-reminder-delay-${index}`}
              value={row.delay}
              onChange={(e) => updateReminder(index, { delay: Number(e.target.value) })}
              style={selectStyle}
            >
              {DELAY_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {delayLabel(n)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle} htmlFor={`quote-reminder-template-${index}`}>
              Email template
            </label>
            <select
              id={`quote-reminder-template-${index}`}
              value={row.templateName}
              onChange={(e) => updateReminder(index, { templateName: e.target.value })}
              style={selectStyle}
            >
              <option value="">Select a template…</option>
              {row.templateName && !templates.some((t) => t.name === row.templateName) ? (
                <option value={row.templateName}>{row.templateName}</option>
              ) : null}
              {templates.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}
    </div>
  );
}
