import React, { useState, useEffect } from "react";
import { isUserAdmin, getApiHeaders } from "../utils/auth";

const API_URL = "";

export default function AppModeBanner() {
  const [appMode, setAppMode] = useState("USE");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const admin = await isUserAdmin();
      setIsAdmin(admin);
      if (admin) {
        await fetchAppMode();
      }
      setLoading(false);
    }
    init();
    
    // Poll for app mode changes every 2 seconds (only if admin)
    const interval = setInterval(async () => {
      const admin = await isUserAdmin();
      if (admin) {
        await fetchAppMode();
      }
    }, 2000);
    
    return () => clearInterval(interval);
  }, []);

  async function fetchAppMode() {
    try {
      const response = await fetch(`${API_URL}/api/admin/app-mode`, {
        headers: getApiHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setAppMode(data.mode || "USE");
      }
    } catch (error) {
      console.error("Error fetching app mode:", error);
    }
  }

  if (loading) {
    return null;
  }

  if (appMode !== "EDIT") {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        background: "#ff6b6b",
        color: "#fff",
        padding: "12px 24px",
        textAlign: "center",
        fontSize: "1rem",
        fontWeight: 600,
        zIndex: 10000,
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      }}
    >
      EDIT MODE ACTIVE — Staff are blocked.
    </div>
  );
}
