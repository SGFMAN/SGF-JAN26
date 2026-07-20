import React, { useState, useEffect, useRef } from "react";

import { UI } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const API_URL = "";

export default function PaymentsSettings() {
  const [holdingAmount, setHoldingAmount] = useState("");
  const [preEngagementAmount, setPreEngagementAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const valuesRef = useRef({ holdingAmount, preEngagementAmount });

  useEffect(() => {
    valuesRef.current = { holdingAmount, preEngagementAmount };
  }, [holdingAmount, preEngagementAmount]);

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
    } catch (error) {
      console.error("Error fetching settings:", error);
      setHoldingAmount("");
      setPreEngagementAmount("");
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    try {
      const response = await fetch(`${API_URL}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holding_amount: (valuesRef.current.holdingAmount || "").trim() || null,
          pre_engagement_amount: (valuesRef.current.preEngagementAmount || "").trim() || null,
        }),
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

  if (loading) {
    return <div style={{ color: MONUMENT }}>Loading...</div>;
  }

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
        flexDirection: "column",
        alignItems: "flex-start",
      }}
    >
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
      </div>
    </div>
  );
}
