import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import logo from "../images/logo.png";
import TimeSheetFourColumns from "./timeSheet/TimeSheetFourColumns";
import TimeSheetOld from "./timeSheet/TimeSheetOld";
import TimeSheetUserTemplate from "./timeSheet/TimeSheetUserTemplate";
import { getPayCycleWednesdayForDate, getPayPeriodDays } from "../utils/timeSheetPayCycle";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const LIGHT_MONUMENT = "#42464d";
const WHITE = "#fff";
const API_URL = "";

const SIDEBAR_VIEWS = [
  { key: "new", label: "Current Pay Cycle" },
  { key: "old", label: "Old Time Sheets" },
  { key: "template", label: "User Template" },
];

function sidebarButtonStyle(isActive) {
  return {
    background: isActive ? WHITE : "transparent",
    color: isActive ? MONUMENT : "#404049",
    border: "none",
    borderRadius: "10px",
    padding: "8px 8px",
    fontSize: "0.95rem",
    fontWeight: 500,
    textAlign: "center",
    letterSpacing: "0.5px",
    cursor: "pointer",
    transition: "background 0.18s, color 0.15s",
    lineHeight: "1.4",
    outline: isActive ? `2px solid ${MONUMENT}` : "none",
    boxShadow: isActive ? "0 2px 4px rgba(50,50,51,.04)" : "none",
    display: "block",
    width: "100%",
    boxSizing: "border-box",
  };
}

export default function TimeSheet() {
  const [activeView, setActiveView] = useState("new");
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState("");

  const currentCycleWednesday = useMemo(() => getPayCycleWednesdayForDate(), []);
  const currentPeriodDays = useMemo(
    () => getPayPeriodDays(currentCycleWednesday),
    [currentCycleWednesday]
  );
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingUsers(true);
        const response = await fetch(`${API_URL}/api/users`);
        if (!response.ok) throw new Error("Failed to fetch users");
        const data = await response.json();
        if (!cancelled && Array.isArray(data)) {
          const sorted = [...data].sort((a, b) =>
            (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" })
          );
          setUsers(sorted);
        }
      } catch (e) {
        console.error("TimeSheet users fetch:", e);
      } finally {
        if (!cancelled) setLoadingUsers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleUserChange(e) {
    setSelectedUserId(e.target.value);
  }

  const userColumnProps = {
    users,
    selectedUserId,
    onUserChange: handleUserChange,
    loadingUsers,
  };

  function renderContent() {
    if (activeView === "old") return <TimeSheetOld />;
    if (activeView === "template") return <TimeSheetUserTemplate {...userColumnProps} />;
    return (
      <TimeSheetFourColumns
        {...userColumnProps}
        showDates
        periodDays={currentPeriodDays}
      />
    );
  }

  return (
    <div
      className="page-container"
      style={{
        position: "fixed",
        inset: 0,
        background: LIGHT_MONUMENT,
        minHeight: "100vh",
        width: "100vw",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          margin: "32px auto 24px auto",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          padding: "0 32px",
          boxSizing: "border-box",
        }}
      >
        <Link to="/projects" style={{ position: "absolute", left: "40px", cursor: "pointer" }}>
          <img src={logo} alt="SGF Logo" style={{ width: "120px", height: "auto" }} />
        </Link>
        <h1
          style={{
            margin: 0,
            fontSize: "2.4rem",
            fontWeight: 700,
            color: WHITE,
            letterSpacing: "1px",
          }}
        >
          Time Sheet
        </h1>
      </div>

      <div
        className="sections-container"
        style={{
          display: "flex",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          margin: "50px auto 0 auto",
          gap: "32px",
        }}
      >
        <div
          className="sidebar-menu"
          style={{
            background: SECTION_GREY,
            borderRadius: "16px",
            width: "200px",
            minWidth: "200px",
            height: "758px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
            padding: "32px 12px",
            boxSizing: "border-box",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            gap: "18px",
            color: MONUMENT,
          }}
        >
          {SIDEBAR_VIEWS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveView(item.key)}
              style={sidebarButtonStyle(activeView === item.key)}
            >
              {item.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <Link
            to="/projects"
            style={{
              background: WHITE,
              color: MONUMENT,
              border: "none",
              borderRadius: "10px",
              padding: "13px 8px",
              fontSize: "1.05rem",
              fontWeight: 500,
              textAlign: "center",
              textDecoration: "none",
              letterSpacing: "0.5px",
              cursor: "pointer",
              transition: "background 0.17s",
              marginBottom: "4px",
              display: "block",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            ← Back to Main
          </Link>
        </div>

        <div
          className="content-section"
          style={{
            background: SECTION_GREY,
            borderRadius: "18px",
            flex: 1,
            minHeight: "758px",
            height: "758px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
            padding: "32px",
            boxSizing: "border-box",
            overflow: "auto",
            color: MONUMENT,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column" }}>
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
