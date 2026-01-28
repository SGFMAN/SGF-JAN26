import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../images/logo.png";

const MONUMENT = "#323233";
const LIGHT_MONUMENT = "#42464d"; // More blue and slightly lighter version of monument
const WHITE = "#fff";
const API_URL = "";

export default function SplashPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [globalPassword, setGlobalPassword] = useState(null);
  const [adminPassword, setAdminPassword] = useState(null);
  const [checkingPassword, setCheckingPassword] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchPasswords();
  }, []);

  async function fetchUsers() {
    try {
      const response = await fetch(`${API_URL}/api/users`);
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

  async function fetchPasswords() {
    try {
      const response = await fetch(`${API_URL}/api/settings`);
      if (!response.ok) {
        throw new Error("Failed to fetch settings");
      }
      const data = await response.json();
      setGlobalPassword(data.global_password || null);
      setAdminPassword(data.admin_password || null);
    } catch (error) {
      console.error("Error fetching passwords:", error);
    }
  }

  async function handleLogin() {
    if (!selectedUserId || !password) {
      alert("Please select a user and enter a password");
      return;
    }

    // Get the selected user to check if they have Admin position
    const selectedUser = users.find((u) => u.id === parseInt(selectedUserId));
    const isAdminUser = selectedUser && 
                       selectedUser.positions && 
                       Array.isArray(selectedUser.positions) &&
                       selectedUser.positions.some((p) => p.name === "Admin");

    let passwordType = "global"; // Track which password was used

    // If user has Admin position, they must use admin password for full access
    if (isAdminUser) {
      if (adminPassword && adminPassword.trim() !== "") {
        if (password === adminPassword) {
          passwordType = "admin"; // Admin password used - full access
        } else if (globalPassword && globalPassword.trim() !== "" && password === globalPassword) {
          passwordType = "global"; // Global password used - restricted access
        } else {
          alert("Incorrect password");
          return;
        }
      } else if (globalPassword && globalPassword.trim() !== "") {
        // No admin password set, but global password exists
        if (password !== globalPassword) {
          alert("Incorrect password");
          return;
        }
        passwordType = "global";
      }
    } else {
      // Non-admin user - must use global password
      if (globalPassword && globalPassword.trim() !== "") {
        if (password !== globalPassword) {
          alert("Incorrect password");
          return;
        }
      } else {
        // If no global password is set, allow login (for initial setup)
      }
    }

    // Store the logged-in user ID and password type in localStorage
    localStorage.setItem("loggedInUserId", selectedUserId);
    localStorage.setItem("passwordType", passwordType);

    // Navigate to projects page
    navigate("/projects");
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
          transition: "opacity 0.3s, transform 0.3s",
          position: "relative",
          zIndex: 1,
          marginTop: "-50px",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = "0.8";
          e.currentTarget.style.transform = "scale(1.05)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = "1";
          e.currentTarget.style.transform = "scale(1)";
        }}
      />
      
      {/* Login Form */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          alignItems: "center",
          minWidth: "300px",
          marginTop: "-50px",
          position: "relative",
          zIndex: 2,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ width: "100%", maxWidth: "300px" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.9rem",
              color: WHITE,
              marginBottom: "6px",
              fontWeight: 500,
            }}
          >
            User
          </label>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            disabled={loading}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "8px",
              border: "none",
              fontSize: "1rem",
              color: MONUMENT,
              background: WHITE,
              boxSizing: "border-box",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            <option value="">Select user...</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ width: "100%", maxWidth: "300px" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.9rem",
              color: WHITE,
              marginBottom: "6px",
              fontWeight: 500,
            }}
          >
            Password
          </label>
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
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "8px",
              border: "none",
              fontSize: "1rem",
              color: MONUMENT,
              background: WHITE,
              boxSizing: "border-box",
            }}
            autoComplete="off"
          />
        </div>

        <button
          type="button"
          onClick={handleLogin}
          disabled={!selectedUserId || !password}
          style={{
            width: "100%",
            maxWidth: "300px",
            padding: "12px 20px",
            fontSize: "1rem",
            fontWeight: 500,
            color: WHITE,
            background: !selectedUserId || !password ? "#666" : MONUMENT,
            border: "none",
            borderRadius: "8px",
            cursor: !selectedUserId || !password ? "not-allowed" : "pointer",
            transition: "background 0.17s",
          }}
        >
          Enter
        </button>
      </div>
    </div>
  );
}
