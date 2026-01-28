import React, { useState, useEffect } from "react";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";

export default function AccountSettings() {
  const [globalPassword, setGlobalPassword] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const response = await fetch(`${API_URL}/api/settings`);
      if (!response.ok) {
        throw new Error("Failed to fetch settings");
      }
      const data = await response.json();
      setGlobalPassword(data.global_password || "");
      setAdminPassword(data.admin_password || "");
    } catch (error) {
      console.error("Error fetching settings:", error);
      alert("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveMessage("");
    try {
      const response = await fetch(`${API_URL}/api/settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          global_password: globalPassword,
          admin_password: adminPassword,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save password");
      }

      setSaveMessage("Password saved successfully!");
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (error) {
      console.error("Error saving password:", error);
      alert("Failed to save password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ width: "100%", height: "100%", padding: "24px 32px", display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ fontSize: "1.5rem", fontWeight: 600, color: MONUMENT, marginBottom: "8px" }}>
        Account Settings
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "32px", width: "100%" }}>
        {/* Column 1: Global Password */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <label
            style={{
              fontSize: "1rem",
              fontWeight: 500,
              color: MONUMENT,
              marginBottom: "4px",
            }}
          >
            Global Password
          </label>
          <input
            type="password"
            value={globalPassword}
            onChange={(e) => setGlobalPassword(e.target.value)}
            disabled={loading}
            placeholder="Enter password for all users"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "8px",
              border: `2px solid ${MONUMENT}`,
              fontSize: "1rem",
              color: MONUMENT,
              background: WHITE,
              boxSizing: "border-box",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSave();
              }
            }}
          />
          <div style={{ fontSize: "0.85rem", color: "#666", marginTop: "-4px" }}>
            This password will be required for all users to access the app.
          </div>

          <button
            onClick={handleSave}
            disabled={loading || saving}
            style={{
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              color: WHITE,
              background: saving ? "#666" : MONUMENT,
              border: "none",
              borderRadius: "8px",
              cursor: loading || saving ? "not-allowed" : "pointer",
              transition: "background 0.17s",
              alignSelf: "flex-start",
              marginTop: "8px",
            }}
          >
            {saving ? "Saving..." : "Save Password"}
          </button>
        </div>

        {/* Column 2: Admin Password */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <label
            style={{
              fontSize: "1rem",
              fontWeight: 500,
              color: MONUMENT,
              marginBottom: "4px",
            }}
          >
            Admin Password
          </label>
          <input
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            disabled={loading}
            placeholder="Enter password for admin access"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "8px",
              border: `2px solid ${MONUMENT}`,
              fontSize: "1rem",
              color: MONUMENT,
              background: WHITE,
              boxSizing: "border-box",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSave();
              }
            }}
          />
          <div style={{ fontSize: "0.85rem", color: "#666", marginTop: "-4px" }}>
            This password will be required for admin users to access the app.
          </div>

          <button
            onClick={handleSave}
            disabled={loading || saving}
            style={{
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              color: WHITE,
              background: saving ? "#666" : MONUMENT,
              border: "none",
              borderRadius: "8px",
              cursor: loading || saving ? "not-allowed" : "pointer",
              transition: "background 0.17s",
              alignSelf: "flex-start",
              marginTop: "8px",
            }}
          >
            {saving ? "Saving..." : "Save Password"}
          </button>
        </div>

        {/* Column 3: Empty for now */}
        <div></div>
      </div>

      {saveMessage && (
        <div
          style={{
            padding: "8px 12px",
            background: "#d4edda",
            color: "#155724",
            borderRadius: "6px",
            fontSize: "0.9rem",
            maxWidth: "400px",
          }}
        >
          {saveMessage}
        </div>
      )}
    </div>
  );
}
