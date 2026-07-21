import React, { useState, useEffect, useRef } from "react";

import {
  DEFAULT_PAYMENT_STAGE_PERCENTS,
  PAYMENT_PERCENT_STAGES,
  parsePercentValue,
  sumStagePercents,
} from "../utils/paymentStageAmounts";
import { UI } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const API_URL = "";

function defaultPercentInputs() {
  return Object.fromEntries(
    PAYMENT_PERCENT_STAGES.map((s) => [s.settingKey, String(DEFAULT_PAYMENT_STAGE_PERCENTS[s.key])])
  );
}

function isDeductPreEngagementOn(value) {
  if (value == null || value === "") return true;
  return value === true || value === "true" || value === "1" || value === "Y" || value === "y";
}

export default function PaymentsSettings() {
  const [holdingAmount, setHoldingAmount] = useState("");
  const [preEngagementAmount, setPreEngagementAmount] = useState("");
  const [deductPreEngagement, setDeductPreEngagement] = useState(true);
  const [percents, setPercents] = useState(() => defaultPercentInputs());
  const [loading, setLoading] = useState(true);
  const valuesRef = useRef({
    holdingAmount,
    preEngagementAmount,
    deductPreEngagement,
    percents,
  });

  useEffect(() => {
    valuesRef.current = {
      holdingAmount,
      preEngagementAmount,
      deductPreEngagement,
      percents,
    };
  }, [holdingAmount, preEngagementAmount, deductPreEngagement, percents]);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/settings`);
      if (!response.ok) {
        throw new Error("Failed to fetch settings");
      }
      const data = await response.json();
      setHoldingAmount(data.holding_amount || "");
      setPreEngagementAmount(data.pre_engagement_amount || "");
      setDeductPreEngagement(isDeductPreEngagementOn(data.deduct_pre_engagement));
      const nextPercents = defaultPercentInputs();
      for (const stage of PAYMENT_PERCENT_STAGES) {
        const raw = data[stage.settingKey];
        if (raw != null && String(raw).trim() !== "") {
          nextPercents[stage.settingKey] = String(parsePercentValue(raw, DEFAULT_PAYMENT_STAGE_PERCENTS[stage.key]));
        }
      }
      setPercents(nextPercents);
    } catch (error) {
      console.error("Error fetching settings:", error);
      setHoldingAmount("");
      setPreEngagementAmount("");
      setDeductPreEngagement(true);
      setPercents(defaultPercentInputs());
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    try {
      const current = valuesRef.current;
      const payload = {
        holding_amount: (current.holdingAmount || "").trim() || null,
        pre_engagement_amount: (current.preEngagementAmount || "").trim() || null,
        deduct_pre_engagement: current.deductPreEngagement ? "true" : "false",
      };
      for (const stage of PAYMENT_PERCENT_STAGES) {
        const raw = (current.percents?.[stage.settingKey] ?? "").toString().trim();
        payload[stage.settingKey] = raw === "" ? null : String(parsePercentValue(raw, 0));
      }

      const response = await fetch(`${API_URL}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        console.error("Failed to save settings:", errorData.error || response.statusText);
        alert(`Failed to save settings: ${errorData.error || response.statusText}`);
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      alert(`Error saving settings: ${error.message}`);
    }
  }

  function handleHoldingAmountChange(e) {
    const newValue = e.target.value;
    setHoldingAmount(newValue);
    valuesRef.current.holdingAmount = newValue;
  }

  function handlePreEngagementAmountChange(e) {
    const newValue = e.target.value;
    setPreEngagementAmount(newValue);
    valuesRef.current.preEngagementAmount = newValue;
  }

  function handlePercentChange(settingKey, rawValue) {
    const cleaned = rawValue.replace(/[^0-9.]/g, "");
    setPercents((prev) => {
      const next = { ...prev, [settingKey]: cleaned };
      valuesRef.current.percents = next;
      return next;
    });
  }

  if (loading) {
    return <div style={{ color: MONUMENT }}>Loading...</div>;
  }

  const percentTotal = sumStagePercents(
    Object.fromEntries(
      PAYMENT_PERCENT_STAGES.map((s) => [s.key, parsePercentValue(percents[s.settingKey], 0)])
    )
  );
  const totalIsExact = Math.abs(percentTotal - 100) < 0.001;

  const cardStyle = {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    backgroundColor: "#E5E5E7",
    padding: "12px",
    borderRadius: "8px",
    width: "100%",
    maxWidth: "420px",
    boxSizing: "border-box",
  };

  const labelStyle = {
    display: "block",
    fontSize: "0.9rem",
    color: UI.textMuted,
    marginBottom: "6px",
    fontWeight: 500,
  };

  const inputStyle = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: "8px",
    border: "none",
    fontSize: "1rem",
    color: MONUMENT,
    background: WHITE,
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        padding: "16px 24px",
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "flex-start",
        gap: "24px",
      }}
    >
      {/* Column 1 */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: "1rem", marginTop: 0, marginBottom: "8px", color: MONUMENT, fontWeight: 600 }}>
          Payments
        </h3>

        <div>
          <label style={labelStyle} htmlFor="holdingAmount">
            Holding Amount
          </label>
          <input
            id="holdingAmount"
            type="text"
            name="holdingAmount"
            inputMode="decimal"
            value={holdingAmount}
            onChange={handleHoldingAmountChange}
            onBlur={saveSettings}
            placeholder="e.g. 2000"
            style={inputStyle}
            autoComplete="off"
          />
        </div>

        <div>
          <label style={labelStyle} htmlFor="preEngagementAmount">
            Pre-Engagement Amount
          </label>
          <input
            id="preEngagementAmount"
            type="text"
            name="preEngagementAmount"
            inputMode="decimal"
            value={preEngagementAmount}
            onChange={handlePreEngagementAmountChange}
            onBlur={saveSettings}
            placeholder="e.g. 5000"
            style={inputStyle}
            autoComplete="off"
          />
        </div>

        <label
          htmlFor="deductPreEngagement"
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "10px",
            padding: "10px 12px",
            borderRadius: "8px",
            background: WHITE,
            cursor: "pointer",
          }}
        >
          <input
            id="deductPreEngagement"
            type="checkbox"
            checked={deductPreEngagement}
            onChange={(e) => {
              const next = e.target.checked;
              setDeductPreEngagement(next);
              valuesRef.current.deductPreEngagement = next;
              void saveSettings();
            }}
            style={{ width: "18px", height: "18px", marginTop: "2px", cursor: "pointer", flexShrink: 0 }}
          />
          <span style={{ fontSize: "0.9rem", color: MONUMENT, lineHeight: 1.35 }}>
            Deduct pre-engagement amount before calculating stage percentages
          </span>
        </label>
      </div>

      {/* Column 2 */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: "1rem", marginTop: 0, marginBottom: "8px", color: MONUMENT, fontWeight: 600 }}>
          Stage Percentages
        </h3>
        <p style={{ margin: "0 0 4px", fontSize: "0.85rem", color: UI.textMuted }}>
          Used to calculate Amounts on each project from Project Cost.
        </p>

        {PAYMENT_PERCENT_STAGES.map((stage) => (
          <div key={stage.settingKey}>
            <label style={labelStyle} htmlFor={stage.settingKey}>
              {stage.label} %
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                id={stage.settingKey}
                type="text"
                name={stage.settingKey}
                inputMode="decimal"
                value={percents[stage.settingKey] ?? ""}
                onChange={(e) => handlePercentChange(stage.settingKey, e.target.value)}
                onBlur={saveSettings}
                placeholder={String(DEFAULT_PAYMENT_STAGE_PERCENTS[stage.key])}
                style={inputStyle}
                autoComplete="off"
              />
              <span style={{ color: UI.textMuted, fontSize: "1rem", flexShrink: 0 }}>%</span>
            </div>
          </div>
        ))}

        <div
          style={{
            marginTop: "8px",
            padding: "10px 12px",
            borderRadius: "8px",
            background: WHITE,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <span style={{ fontSize: "0.9rem", color: UI.textMuted, fontWeight: 500 }}>Combined total</span>
          <span
            style={{
              fontSize: "1.05rem",
              fontWeight: 600,
              color: totalIsExact ? "#2f6b3a" : "#a33",
            }}
          >
            {Number.isInteger(percentTotal) ? percentTotal : percentTotal.toFixed(2)}%
            {!totalIsExact ? " (should be 100%)" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
