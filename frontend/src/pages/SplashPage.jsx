import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import useAppLogo from "../hooks/useAppLogo.js";
import { setAuthSession } from "../utils/auth";
import { UI } from "../utils/uiThemeTokens";
import { APP_VERSION } from "../utils/appVersion";

const API_URL = "";
const MONUMENT = UI.textPrimary;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;

const fieldLabelStyle = {
  display: "block",
  fontSize: "0.9rem",
  color: PAGE_TEXT,
  marginBottom: "6px",
  fontWeight: 500,
};

const fieldControlStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "8px",
  border: "none",
  fontSize: "1rem",
  color: MONUMENT,
  background: WHITE,
  boxSizing: "border-box",
};

export default function SplashPage() {
  const logo = useAppLogo();
  const navigate = useNavigate();
  const location = useLocation();
  const [loginMode, setLoginMode] = useState("staff");
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [password, setPassword] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      const response = await fetch(`${API_URL}/api/users/names`);
      if (!response.ok) {
        throw new Error("Failed to fetch users");
      }
      const data = await response.json();
      setUsers(data);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    if (!selectedUserId || !password) {
      alert("Please select a user and enter a password");
      return;
    }

    setLoggingIn(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: parseInt(selectedUserId, 10),
          password,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Login failed" }));
        alert(errorData.error || "Incorrect password");
        return;
      }

      const data = await response.json();
      setAuthSession(data.userId, data.passwordType, data.user?.name);

      const redirectTo = location.state?.from?.pathname || "/projects";
      navigate(redirectTo, { replace: true });
    } catch (error) {
      console.error("Error logging in:", error);
      alert("Login failed. Please try again.");
    } finally {
      setLoggingIn(false);
    }
  }

  function tabButtonStyle(active) {
    return {
      flex: 1,
      padding: "10px 14px",
      fontSize: "0.95rem",
      fontWeight: 600,
      color: active ? UI.buttonPrimaryText : PAGE_TEXT,
      background: active ? UI.buttonPrimary : "transparent",
      border: `1px solid ${active ? UI.buttonPrimary : WHITE}`,
      borderRadius: "8px",
      cursor: "pointer",
      transition: "background 0.17s, color 0.17s, border-color 0.17s",
    };
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: LIGHT_MONUMENT,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        paddingTop: "calc(15% - 500px)",
      }}
    >
      <img
        src={logo}
        alt="SGF Logo"
        style={{
          maxWidth: "1000px",
          maxHeight: "80%",
          objectFit: "contain",
          position: "relative",
          zIndex: 1,
          marginTop: "-50px",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          alignItems: "center",
          minWidth: "300px",
          width: "100%",
          maxWidth: "320px",
          marginTop: "-50px",
          position: "relative",
          zIndex: 2,
          padding: "0 12px",
          boxSizing: "border-box",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            fontSize: "0.75rem",
            color: "#ffffff",
            opacity: 0.7,
            letterSpacing: "0.02em",
            textAlign: "center",
          }}
        >
          {APP_VERSION}
        </div>

        <div
          style={{
            display: "flex",
            gap: "8px",
            width: "100%",
          }}
          role="tablist"
          aria-label="Login type"
        >
          <button
            type="button"
            role="tab"
            aria-selected={loginMode === "staff"}
            onClick={() => setLoginMode("staff")}
            style={tabButtonStyle(loginMode === "staff")}
          >
            Staff
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={loginMode === "client"}
            onClick={() => setLoginMode("client")}
            style={tabButtonStyle(loginMode === "client")}
          >
            Client Portal
          </button>
        </div>

        {loginMode === "staff" ? (
          <>
            <div style={{ width: "100%" }}>
              <label style={fieldLabelStyle}>User</label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                disabled={loading || loggingIn}
                style={{
                  ...fieldControlStyle,
                  cursor: loading || loggingIn ? "not-allowed" : "pointer",
                }}
              >
                <option value="">
                  {loading ? "Loading..." : users.length === 0 ? "No users" : "Select user..."}
                </option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ width: "100%" }}>
              <label style={fieldLabelStyle}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleLogin();
                  }
                }}
                placeholder="Enter password"
                disabled={loggingIn}
                style={fieldControlStyle}
                autoComplete="off"
              />
            </div>

            <button
              type="button"
              onClick={handleLogin}
              disabled={!selectedUserId || !password || loggingIn}
              style={{
                width: "100%",
                padding: "12px 20px",
                fontSize: "1rem",
                fontWeight: 500,
                color: UI.buttonPrimaryText,
                background: !selectedUserId || !password || loggingIn ? "#666" : UI.buttonPrimary,
                border: "none",
                borderRadius: "8px",
                cursor: !selectedUserId || !password || loggingIn ? "not-allowed" : "pointer",
                transition: "background 0.17s",
              }}
            >
              {loggingIn ? "Signing in…" : "Enter"}
            </button>
          </>
        ) : (
          <>
            <div style={{ width: "100%" }}>
              <label style={fieldLabelStyle} htmlFor="client-portal-email">
                Email Address
              </label>
              <input
                id="client-portal-email"
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="you@example.com"
                style={fieldControlStyle}
                autoComplete="email"
              />
            </div>

            <button
              type="button"
              onClick={() => {}}
              style={{
                width: "100%",
                padding: "12px 20px",
                fontSize: "1rem",
                fontWeight: 500,
                color: UI.buttonPrimaryText,
                background: UI.buttonPrimary,
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "background 0.17s",
              }}
            >
              Email me a secure login link
            </button>

            <div
              style={{
                width: "100%",
                textAlign: "center",
                fontSize: "0.9rem",
                color: PAGE_TEXT,
                opacity: 0.85,
                lineHeight: 1.4,
              }}
            >
              Client Portal coming soon.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
